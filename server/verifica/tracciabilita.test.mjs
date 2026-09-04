// ═══════════════════════════════════════════════════════════════════════════
//  LA TRACCIABILITÀ — l'analisi va a registro, e la richiesta lascia una riga
//
//  Nasce da un guasto vero. Il 04/09/2026 un parametro è finito in tabella
//  prima del codice che sapeva leggerlo, e per 5 minuti e 45 secondi il modulo
//  ha calcolato pensioni più alte del vero. La domanda «in quella finestra
//  qualcuno ha stampato un foglio?» non ha avuto risposta: il backend non
//  registrava nessuna richiesta, e le analisi non venivano salvate da nessuna
//  parte. Due buchi, un solo effetto — non si può sapere cosa è uscito.
//
//  Queste prove sorvegliano quello che rende utile l'archivio, non il fatto
//  che scriva: che porti la versione delle regole del motore che ha davvero
//  fatto il conto, che il collaboratore lo dica il token e non il browser, e
//  che nel giornale della macchina non finisca l'indirizzo di un cliente.
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const P = require('../../tariffe/motore/previdenza.js');
/* Le due porte nuove si importano «con la rete»: su un codice che non le ha
   ancora, questa prova deve poter girare e dire QUALE comportamento manca —
   non morire all'import lasciando in dubbio se è rossa per il motivo giusto.
   È la contrapprova, e serve appunto a girare sul codice di prima. */
const manca = (dove) => { throw new Error('server/' + dove + ' non c\'è o non esporta questa funzione'); };
const A = await import('../analisiPrevidenziali.js').catch(() => ({}));
const R = await import('../registro.js').catch(() => ({}));
if (!A.preparaRiga) { A.preparaRiga = () => manca('analisiPrevidenziali.js'); A.LIMITE_BYTE = 512 * 1024; }
if (!R.registroRichieste) { R.registroRichieste = () => manca('registro.js'); R.riga = () => manca('registro.js'); R.daRegistrare = () => manca('registro.js'); }
if (!P.schedaArchivio) P.schedaArchivio = () => manca('../tariffe/motore/previdenza.js');

const qui = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const radice = path.dirname(qui);

/* ── UN EXPRESS VERO, non un finto ─────────────────────────────────────────
   La prima versione di questa prova costruiva un `req` a mano, con il percorso
   sempre uguale, e passava. In produzione la prima riga scritta diceva
   «POST / 401» invece di «POST /analisi-previdenziali 401»: Express riscrive
   `req.url` quando la richiesta entra in un router montato, e chi registrava
   alla fine trovava '/'. Il registro c'era e non serviva a niente.
   Da qui in poi la richiesta la fa un Express vero, con un router montato e
   una risposta che parte da dentro: e' l'unico modo perche' quel guasto, se
   torna, faccia diventare rossa questa prova. */
const GIRO = await (async () => {
  const righe = [];
  try {
    const express = (await import('express')).default;
    const app = express();
    if (R.registroRichieste) app.use(R.registroRichieste(r => righe.push(r)));
    const dentro = express.Router();
    dentro.post('/', (req, res) => res.status(401).json({ error: 'token mancante' }));
    app.use('/analisi-previdenziali', dentro);
    app.get('/health', (req, res) => res.json({ ok: true }));
    const srv = app.listen(0);
    await new Promise(r => srv.on('listening', r));
    const porta = srv.address().port;
    await fetch('http://127.0.0.1:' + porta + '/analisi-previdenziali?email=mario.rossi%40gmail.com', { method: 'POST' });
    await fetch('http://127.0.0.1:' + porta + '/health');
    await new Promise(r => setTimeout(r, 50));
    srv.close();
  } catch (e) { righe.push('ERRORE: ' + e.message); }
  return righe;
})();

const esiti = [];
const prova = (nome, fn) => { try { esiti.push([true, nome, fn() || '']); } catch (e) { esiti.push([false, nome, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

const IO = { id: '11111111-2222-3333-4444-555555555555' };
const UNALTRO = '99999999-8888-7777-6666-555555555555';

/* Il consulente ha corretto a mano il rendimento del fondo: il conto si fa con
   quella correzione, ed è con quella che deve finire in archivio. */
const CORREZIONI = { rendFondo: 0.04 };
const analisi = (corr) => {
  const pr = P.prospettivaPensionistica({ eta: 33, etaPensionamento: 67, redditoAnnuo: 24000,
    anniContributiGia: 9, annoRiferimento: 2026, gestione: 'dipendenti_privati' }, corr);
  const vl = P.valutaSoluzione(pr, 200, corr);
  return { prospettiva: pr, valutazione: vl };
};
const scheda = (extra) => P.schedaArchivio(Object.assign({
  cliente: { nome: 'Mario Rossi' },
  consulente: { nome: 'Francesco Oddo', ruolo: 'Consulente previdenziale', rui: 'B000123456' },
  dataRiferimento: '04/09/2026',
  correzioni: CORREZIONI,
}, analisi(CORREZIONI), extra || {}));

/* ── LA SCHEDA ──────────────────────────────────────────────────────────── */

prova('la versione delle regole la scrive il motore, non chi chiama', () => {
  /* IL CASO CHE DEVE FALLIRE. Si passa una versione inventata da fuori: se un
     giorno la scheda si mettesse a copiare quello che le arriva — o la
     schermata scrivesse la versione a mano in un altro file — l'archivio
     comincerebbe a raccontare con quale codice NON è stato fatto il conto, e
     nessuno se ne accorgerebbe finché non serve. */
  const s = scheda({ versione_motore: 'inventata-dal-browser', riga: { versione_motore: 'pure-questa' } });
  deve(s.ok, 'la scheda non si è costruita: ' + (s.problemi || []).join('; '));
  deve(s.riga.versione_motore === P.VERSIONE_REGOLE,
    'la scheda porta «' + s.riga.versione_motore + '» invece della versione del motore (' + P.VERSIONE_REGOLE + ')');
  return 'versione ' + s.riga.versione_motore;
});

prova('in archivio finiscono i parametri di quel giorno, non solo il risultato', () => {
  /* È la parte che non si può ricostruire dopo: fra due anni i coefficienti in
     tabella sono altri. Se qualcuno un domani alleggerisce la scheda tenendo
     solo i numeri finali, l'archivio resta pieno e diventa inutile — e questa
     prova diventa rossa prima che succeda. */
  const s = scheda();
  const pu = s.riga.parametri_usati;
  deve(pu && pu.ipotesi && Object.keys(pu.ipotesi).length >= 5,
    'la scheda non porta le ipotesi usate: senza, l\'analisi non si rifà');
  deve(pu.coefficienti && typeof pu.coefficienti.usato === 'number',
    'la scheda non porta il coefficiente di trasformazione applicato');
  deve(pu.ipotesi.rendFondo && pu.ipotesi.rendFondo.corretta === true && pu.ipotesi.rendFondo.v === 0.04,
    'la correzione a mano del consulente non risulta fra le ipotesi: due analisi diverse dello stesso cliente sarebbero inspiegabili');
  deve(s.riga.scelte.correzioni && s.riga.scelte.correzioni.rendFondo === 0.04,
    'le correzioni scritte a mano non sono in archivio: è la prima cosa che si guarda quando due conti non tornano');
  return Object.keys(pu.ipotesi).length + ' ipotesi, coefficiente ' + (pu.coefficienti.usato * 100).toFixed(3) + '%';
});

prova('senza il consulente che firma la scheda si rifiuta', () => {
  const s = P.schedaArchivio(Object.assign({ cliente: { nome: 'Mario Rossi' }, dataRiferimento: '04/09/2026' }, analisi(CORREZIONI)));
  deve(!s.ok, 'ha archiviato un\'analisi che non è di nessuno');
  deve(s.problemi.join(' ').includes('consulente'), 'non dice che manca il consulente');
});

prova('su un calcolo non riuscito non si archivia niente', () => {
  const s = P.schedaArchivio({ prospettiva: { ok: false }, valutazione: { ok: false },
    cliente: { nome: 'X' }, consulente: { nome: 'Y' }, dataRiferimento: '04/09/2026' });
  deve(!s.ok && s.riga === null, 'ha prodotto una riga da un calcolo fallito');
});

/* ── LA PORTA ───────────────────────────────────────────────────────────── */

prova('il collaboratore lo dice il token: quello scritto nel corpo si ignora', () => {
  /* IL CASO CHE DEVE FALLIRE. Si manda una riga già intestata a un altro. Se
     domani qualcuno scrivesse `creato_da: r.creato_da || utente.id` — che
     sembra innocuo — l'archivio diventerebbe intestabile a piacere: uno può
     attribuire i propri fogli a un collega, o togliersi i propri. */
  const p = A.preparaRiga({ riga: Object.assign(scheda().riga, { creato_da: UNALTRO }) }, IO);
  deve(p.ok, 'la riga è stata rifiutata: ' + p.errore);
  deve(p.riga.creato_da === IO.id,
    'la riga risulta di ' + p.riga.creato_da + ' invece che di chi era collegato');
});

prova('una scheda senza versione delle regole non entra', () => {
  const r = scheda().riga; delete r.versione_motore;
  const p = A.preparaRiga({ riga: r }, IO);
  deve(!p.ok, 'ha archiviato una scheda che non dice con che codice è nata');
  deve(/version/i.test(p.errore), 'l\'errore non spiega cosa manca: ' + p.errore);
});

prova('senza un utente riconosciuto non si scrive', () => {
  deve(!A.preparaRiga({ riga: scheda().riga }, null).ok, 'ha scritto una riga senza sapere di chi è');
  deve(!A.preparaRiga({ riga: scheda().riga }, { id: 'pippo' }).ok, 'ha accettato un identificativo che non è un uuid');
});

prova('un riferimento anagrafica che non è un uuid diventa vuoto, non un errore', () => {
  const p = A.preparaRiga({ riga: Object.assign(scheda().riga, { anagrafica_id: 'cliente-42' }) }, IO);
  deve(p.ok && p.riga.anagrafica_id === null, 'il riferimento sbagliato è passato: il database rifiuterebbe la riga intera');
});

prova('una scheda smisurata si ferma qui, non nel database', () => {
  const r = scheda().riga;
  r.dati.zavorra = 'x'.repeat(A.LIMITE_BYTE + 1000);
  const p = A.preparaRiga({ riga: r }, IO);
  deve(!p.ok && /grande/.test(p.errore), 'ha lasciato passare una scheda oltre il limite');
});

/* ── IL REGISTRO DELLE RICHIESTE ────────────────────────────────────────── */

prova('nel giornale non finisce mai la query, e quindi mai l\'email di un cliente', () => {
  /* IL CASO CHE DEVE FALLIRE. QUOTO passa `?email=...` fra le sue pagine: se un
     domani si registrasse `req.originalUrl` invece di `req.path`, l'indirizzo
     di ogni cliente finirebbe in un giornale che nessuno cancella. */
  const righe = [];
  const mw = R.registroRichieste(r => righe.push(r));
  const fine = [];
  const req = { method: 'GET', path: '/crm/anagrafica', url: '/crm/anagrafica',
    originalUrl: '/crm/anagrafica?email=mario.rossi%40gmail.com&cf=RSSMRA80A01H501U' };
  const res = { statusCode: 200, on: (e, f) => { if (e === 'finish') fine.push(f); } };
  /* Come fa Express quando la richiesta entra in un router montato. */
  mw(req, res, () => { req.url = '/'; req.path = '/'; });
  fine.forEach(f => f());
  deve(righe.length === 1, 'non ha registrato la richiesta');
  deve(!/@|email|RSSMRA/i.test(righe[0]), 'la riga porta con sé la query: ' + righe[0]);
  deve(righe[0].includes('/crm/anagrafica'), 'non registra nemmeno il percorso: ' + righe[0]);
  return righe[0];
});

prova('il percorso registrato è quello vero, anche quando risponde un router montato', () => {
  /* IL CASO CHE DEVE FALLIRE — ed è fallito davvero, in produzione, il
     04/09/2026. Se qualcuno tornasse a leggere `req.path` alla fine invece di
     `req.originalUrl` all'inizio, questa riga tornerebbe a dire «/». */
  deve(GIRO.length >= 1, 'il registro non ha scritto niente: ' + JSON.stringify(GIRO));
  const r = GIRO.find(x => x.includes('POST'));
  deve(r, 'la richiesta POST non è stata registrata: ' + JSON.stringify(GIRO));
  deve(r.includes('/analisi-previdenziali'),
    'la riga non dice dove è andata la richiesta: ' + r);
  deve(!/@|email/i.test(r), 'la riga porta con sé la query, e con quella l\'indirizzo del cliente: ' + r);
  deve(/ 401 /.test(r), 'la riga non porta l\'esito: ' + r);
  return r;
});

prova('una sonda che risponde bene non lascia riga, nemmeno passando da Express', () => {
  deve(!GIRO.some(x => x.includes('/health')), 'il giornale si riempie di /health: ' + JSON.stringify(GIRO));
});

prova('di chi chiama restano otto cifre, non l\'identificativo intero', () => {
  const r = R.riga({ quando: Date.now(), ms: 12, metodo: 'POST', percorso: '/analisi-previdenziali',
    stato: 200, utente: IO.id });
  deve(!r.includes(IO.id), 'la riga porta l\'identificativo completo dell\'utente');
  deve(r.includes('u:' + IO.id.slice(0, 8)), 'non c\'è modo di mettere in fila le richieste di una stessa persona: ' + r);
});

prova('le sonde non riempiono il giornale, ma un loro errore sì', () => {
  /* Il silenzio serve a rendere leggibile il resto. Se però /health risponde
     male, quella è precisamente la riga che si va a cercare. */
  deve(R.daRegistrare('/health', 200) === false, '/health a posto riempie il giornale di niente');
  deve(R.daRegistrare('/health', 503) === true, 'un /health rotto passa inosservato');
  deve(R.daRegistrare('/analisi-previdenziali', 200) === true, 'un salvataggio riuscito non lascia traccia');
});

/* ── IL MONTAGGIO ───────────────────────────────────────────────────────── */

prova('la rotta è montata sul backend che gira davvero, e dietro il login', () => {
  const idx = fs.readFileSync(path.join(qui, 'index.js'), 'utf8');
  const riga = idx.split('\n').find(r => r.includes("app.use('/analisi-previdenziali'"));
  deve(riga, 'server/index.js non monta /analisi-previdenziali: la schermata scriverebbe nel vuoto');
  deve(/requireAuth/.test(riga), 'la rotta è aperta a chiunque: chiunque potrebbe riempire l\'archivio');
  deve(/app\.use\(registroRichieste\(\)\)/.test(idx), 'il registro delle richieste non è montato');
  /* Prima di ogni rotta, o le richieste che finiscono in errore prima di
     arrivare da qualche parte non lascerebbero riga. */
  deve(idx.indexOf('app.use(registroRichieste())') < idx.indexOf("app.use('/mail'"),
    'il registro è montato dopo le rotte: non vedrebbe quello che si ferma prima');
});

prova('la stampa non aspetta l\'archivio', () => {
  /* Il consulente è seduto davanti a un cliente: se il salvataggio si mette in
     mezzo — server lento, rete che non va — il foglio non esce. Prima si
     stampa, poi si archivia. */
  const html = fs.readFileSync(path.join(radice, 'index.html'), 'utf8');
  const f = html.slice(html.indexOf('function prevApriReport()'), html.indexOf('async function prevArchivia'));
  deve(f.includes('prevArchivia('), 'il report non viene più archiviato');
  deve(f.indexOf('w.document.write(r.html)') < f.indexOf('prevArchivia('),
    'l\'archiviazione precede la stampa: un archivio lento terrebbe fermo il foglio');
  deve(!/await\s+prevArchivia/.test(f), 'la stampa aspetta l\'archivio');
  deve(/NON \S+ finito in archivio|NON è finito in archivio/.test(html),
    'un archivio che fallisce in silenzio è peggio di non averlo: manca l\'avviso al consulente');
});

/* ── esecuzione ──────────────────────────────────────────────────────────── */
let ok = 0;
for (const [passata, nome, msg] of esiti) {
  if (passata) { ok++; console.log('  ✅ ' + nome + (msg ? '  — ' + msg : '')); }
  else console.log('  ❌ ' + nome + '  — ' + msg);
}
console.log('\n' + (ok === esiti.length ? '🟢' : '🔴') + ' Tracciabilità: ' + ok + '/' + esiti.length);
process.exit(ok === esiti.length ? 0 : 1);
