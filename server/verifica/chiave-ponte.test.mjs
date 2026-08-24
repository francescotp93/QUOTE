// ═══════════════════════════════════════════════════════════════════════════════
//  LA CHIAVE DEL PONTE — dove sta e come si comporta quando le cose vanno male
//
//  Che cosa sorveglia, e perché.
//
//  La chiave apre l'API v1. Non sta in un file: nasce dentro Supabase e i due
//  lati del ponte (questo backend e la Edge Function dalla parte di IAM) la
//  leggono da lì. È il modo di non farla passare per una chat, un ramo di git o
//  un appunto sul telefono — tre posti da cui un segreto non torna indietro.
//
//  Ma spostare un segreto in rete introduce un modo nuovo di sbagliare: il
//  database non risponde. La domanda a cui queste prove rispondono è una sola —
//  **quando la chiave non arriva, la porta resta chiusa o si apre?**
//  Un'API che si apre a chiunque perché il segreto non è arrivato sarebbe molto
//  peggio di un'API che non si apre.
//
//  Supabase non viene mai chiamato: al suo posto c'è una lettura finta che si
//  può far rispondere bene, male o lentamente a comando.
// ═══════════════════════════════════════════════════════════════════════════════
import http from 'http';
import express from 'express';
import { chiaveCondivisa, impronta } from '../chiaveCondivisa.js';
import { creaApiQuotazione } from '../quoteApi.js';

const esiti = [];
const prova = (nome, fn) => esiti.push({ nome, fn });
const deve = (c, msg) => { if (!c) throw new Error(msg); };
const respira = (ms) => new Promise(r => setTimeout(r, ms));

/* L'ambiente va rimesso a posto fra una prova e l'altra: chiaveCondivisa legge
   process.env al momento in cui la si costruisce. */
function senzaAmbiente(fn) {
  const prima = process.env.INTERNAL_API_KEY;
  delete process.env.INTERNAL_API_KEY;
  return Promise.resolve().then(fn).finally(() => {
    if (prima === undefined) delete process.env.INTERNAL_API_KEY;
    else process.env.INTERNAL_API_KEY = prima;
  });
}

// ── 1. La lettura ────────────────────────────────────────────────────────────
prova('la chiave si legge dal posto concordato e diventa quella buona', () => senzaAmbiente(async () => {
  const k = chiaveCondivisa({ url: 'https://finto', servizio: 'finto', recupera: async () => 'segreto-dal-database' });
  await k.aspetta();
  deve(k() === 'segreto-dal-database', 'ha letto «' + k() + '»');
  deve(k.pronta() === true, 'non si dichiara pronta');
}));

prova('finché non è arrivata, la porta resta chiusa', () => senzaAmbiente(async () => {
  /* Questo è il punto della prova: nell'attimo fra l'avvio e la risposta del
     database la chiave non c'è. Se in quell'attimo valesse stringa vuota E il
     guardiano accettasse stringa vuota, chiunque entrerebbe con una richiesta
     senza intestazione. */
  let sblocca;
  const k = chiaveCondivisa({ url: 'https://finto', servizio: 'finto',
    recupera: () => new Promise(r => { sblocca = () => r('arrivata'); }) });
  deve(k() === '', 'prima della risposta la chiave vale «' + k() + '»');
  deve(k.pronta() === false, 'si dichiara pronta senza avere niente');
  await respira(0);   // la lettura parte su un micro-passo: prima di lì «sblocca» non esiste ancora
  sblocca(); await k.aspetta();
  deve(k() === 'arrivata', 'dopo la risposta non l\'ha presa');
}));

prova('se il database non risponde, non inventa niente', () => senzaAmbiente(async () => {
  const k = chiaveCondivisa({ url: 'https://finto', servizio: 'finto',
    recupera: async () => { throw new Error('502'); } });
  await k.aspetta();
  deve(k() === '', 'con il database giù la chiave vale «' + k() + '»: qualcuno l\'ha inventata');
}));

prova('senza indirizzo o senza chiave di servizio non ci prova nemmeno', () => senzaAmbiente(async () => {
  const registro = [];
  const k = chiaveCondivisa({ url: '', servizio: '', log: (r) => registro.push(r) });
  await k.aspetta();
  deve(k() === '', 'ha tirato fuori una chiave dal niente');
  const riga = registro.find(r => r.evento === 'chiave_non_letta');
  deve(riga, 'non ha detto che non ce l\'ha fatta: sarebbe un ponte chiuso e muto');
  deve(/SUPABASE/.test(String(riga.motivo)), 'il motivo non dice cosa manca: ' + riga.motivo);
}));

// ── 2. La via di fuga ────────────────────────────────────────────────────────
prova('la variabile d\'ambiente vince, e il database non viene nemmeno chiamato', async () => {
  const prima = process.env.INTERNAL_API_KEY;
  process.env.INTERNAL_API_KEY = 'chiave-messa-a-mano';
  try {
    let chiamate = 0;
    const k = chiaveCondivisa({ url: 'https://finto', servizio: 'finto',
      recupera: async () => { chiamate++; return 'quella-del-database'; } });
    await k.aspetta();
    deve(k() === 'chiave-messa-a-mano', 'ha usato «' + k() + '»');
    deve(chiamate === 0, 'ha interrogato il database lo stesso (' + chiamate + ' volte): la via di fuga serve proprio a quando non risponde');
  } finally {
    if (prima === undefined) delete process.env.INTERNAL_API_KEY;
    else process.env.INTERNAL_API_KEY = prima;
  }
});

// ── 3. Il segreto non si mostra ──────────────────────────────────────────────
prova('nel registro finisce l\'impronta, mai la chiave', () => senzaAmbiente(async () => {
  const registro = [];
  const k = chiaveCondivisa({ url: 'https://finto', servizio: 'finto',
    log: (r) => registro.push(r), recupera: async () => 'questo-e-il-segreto' });
  await k.aspetta();
  const testo = JSON.stringify(registro);
  deve(!testo.includes('questo-e-il-segreto'), 'la chiave e\' finita nel registro: ' + testo.slice(0, 120));
  deve(testo.includes(impronta('questo-e-il-segreto')), 'manca l\'impronta: due copie diverse non si scoprirebbero');
  deve(k.impronta() === impronta('questo-e-il-segreto'), 'l\'impronta esposta non corrisponde');
}));

prova('dall\'impronta non si torna alla chiave', () => {
  const a = impronta('chiave-uno'), b = impronta('chiave-due');
  deve(a !== b, 'due chiavi diverse hanno la stessa impronta');
  deve(a.length === 12, 'l\'impronta e\' lunga ' + a.length + ': se fosse tutto lo sha256 sarebbe comunque da non stampare, ma tanto vale essere brevi');
  deve(impronta('') === null && impronta(null) === null, 'un\'impronta del niente non deve sembrare un\'impronta vera');
});

// ── 4. Insieme al guardiano dell'API ─────────────────────────────────────────
async function conApi(k, fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', creaApiQuotazione({ chiave: k, prodotti: { casa: { attivo: true, quota: async () => ({ ok: true, risultati: [] }) } }, log: () => {} }));
  const srv = http.createServer(app);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port + '/api/v1';
  try { return await fn(base); } finally { srv.close(); }
}
const stato = (url, chiave) => fetch(url, { headers: chiave ? { 'X-Internal-Key': chiave } : {} }).then(r => r.status);

prova('con la chiave non ancora letta, l\'API risponde 401 a tutto', () => senzaAmbiente(async () => {
  let sblocca;
  const k = chiaveCondivisa({ url: 'https://finto', servizio: 'finto',
    recupera: () => new Promise(r => { sblocca = () => r('la-chiave-buona'); }) });
  await conApi(k, async (base) => {
    deve(await stato(base + '/products') === 401, 'senza intestazione e\' entrato lo stesso');
    deve(await stato(base + '/products', '') === 401, 'con intestazione vuota e\' entrato');
    deve(await stato(base + '/products', 'la-chiave-buona') === 401, 'e\' entrato con una chiave che il backend non ha ancora letto');
    sblocca(); await k.aspetta();
    deve(await stato(base + '/products', 'la-chiave-buona') === 200, 'dopo la lettura non lo lascia piu\' entrare');
  });
}));

prova('se la chiave cambia, il ponte segue senza riavviare il backend', () => senzaAmbiente(async () => {
  /* Con una stringa fissa presa una volta all'avvio, cambiare la chiave
     chiuderebbe il ponte fino al riavvio successivo — e nessuno capirebbe
     perche'. Il guardiano la richiede a ogni richiesta. */
  let corrente = 'prima-chiave';
  const k = chiaveCondivisa({ url: 'https://finto', servizio: 'finto',
    riprovaMs: 0, rinfrescaMs: 0, recupera: async () => corrente });
  await k.aspetta();
  await conApi(k, async (base) => {
    deve(await stato(base + '/products', 'prima-chiave') === 200, 'non entra con la chiave giusta');
    corrente = 'seconda-chiave';
    k();                      // una richiesta qualunque fa ripartire la lettura
    await k.aspetta();
    deve(await stato(base + '/products', 'seconda-chiave') === 200, 'la chiave nuova non apre: servirebbe un riavvio del backend');
    deve(await stato(base + '/products', 'prima-chiave') === 401, 'la chiave vecchia apre ancora');
  });
}));

prova('una chiave sbagliata della stessa lunghezza non entra', () => senzaAmbiente(async () => {
  /* Il confronto e' a tempo costante e vuole due stringhe della stessa
     lunghezza: se il codice si limitasse a confrontare le lunghezze, o se
     esplodesse su lunghezze diverse, si vedrebbe qui. */
  const k = chiaveCondivisa({ url: 'https://finto', servizio: 'finto', recupera: async () => 'abcdefgh' });
  await k.aspetta();
  await conApi(k, async (base) => {
    deve(await stato(base + '/products', 'abcdefgh') === 200, 'non entra con quella giusta');
    deve(await stato(base + '/products', 'abcdefgX') === 401, 'e\' entrato con una chiave sbagliata');
    deve(await stato(base + '/products', 'abcdefghi') === 401, 'e\' entrato con una chiave piu\' lunga');
    deve(await stato(base + '/products', 'abc') === 401, 'e\' entrato con una chiave piu\' corta');
  });
}));

// ── esecuzione ───────────────────────────────────────────────────────────────
let ko = 0;
console.log('\nLA CHIAVE DEL PONTE');
for (const { nome, fn } of esiti) {
  try { await fn(); console.log('  ok  ' + nome); }
  catch (e) { ko++; console.log('  X   ' + nome + '\n      ' + e.message); }
}
console.log(`\nCHIAVE PONTE: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
