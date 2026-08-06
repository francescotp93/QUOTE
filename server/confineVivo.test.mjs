// ═══════════════════════════════════════════════════════════════════════════════
//  IL CONFINE, SUL CODICE CHE GIRA DAVVERO
//
//  `confineScraper.test.mjs` prova il modulo. Questa prova monta i router VERI
//  (`server/moto.js`, `server/fonti.js`) davanti a uno scraper FINTO in-process,
//  e controlla che cosa arriva al frontend.
//
//  Perche' serve anche questa. Il modulo puo' essere perfetto e non essere usato:
//  e' gia' successo con `scraper/comune/esito.mjs`, scritto, provato con 17
//  asserzioni verdi, e importato da nessuno.
//
//  NON tocca nessun portale: lo «scraper» e' un http.createServer su una porta
//  libera di 127.0.0.1, e risponde quello che gli si dice. Nessun browser,
//  nessuna credenziale, nessun dato di cliente.
//
//      node server/confineVivo.test.mjs
// ═══════════════════════════════════════════════════════════════════════════════
import http from 'http';

// Le dipendenze del backend possono non esserci (il repo non versiona il lock).
// In quel caso si dice e si esce buoni: la prova pura gira comunque.
let express;
try { express = (await import('express')).default; }
catch {
  console.log('\nCONFINE VIVO — SALTATA: mancano le dipendenze del backend (cd server && npm install)\n');
  process.exit(0);
}

const esiti = [];
const prova = async (nome, fn) => {
  try { const m = await fn(); esiti.push([true, nome, m || '']); }
  catch (e) { esiti.push([false, nome, e.message]); }
};
const deve = (c, msg) => { if (!c) throw new Error(msg); };

// ── Lo scraper finto ─────────────────────────────────────────────────────────
// `risposta` decide che cosa dire alla prossima chiamata. Nessuna logica: e' un
// eco programmabile, esattamente come si comporterebbe uno scraper vero rotto.
let risposta = { http: 200, ct: 'application/json', corpo: '{}' };
const chiamate = [];
const finto = http.createServer((req, res) => {
  chiamate.push(req.url);
  res.statusCode = risposta.http;
  res.setHeader('Content-Type', risposta.ct);
  res.end(risposta.corpo);
});
await new Promise(r => finto.listen(0, '127.0.0.1', r));
const PORTA_FINTA = finto.address().port;
const URL_FINTO = 'http://127.0.0.1:' + PORTA_FINTA;

const rispondi = (corpo, { http: h = 200, ct = 'application/json; charset=utf-8' } = {}) => {
  risposta = { http: h, ct, corpo: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) };
};

// Tutti gli scraper puntano al finto: nessuna porta reale viene mai toccata.
for (const k of ['MOTO_SCRAPER_URL', 'ALLIANZ_SCRAPER_URL', 'ITALIANA_SCRAPER_URL', 'HDI_SCRAPER_URL',
  'GROUPAMA_SCRAPER_URL', 'PRIMA_SCRAPER_URL', 'AXA_SCRAPER_URL']) process.env[k] = URL_FINTO;
/* Archivio fonti FINTO, in un file temporaneo: una sola fonte inventata che
   punta allo scraper finto. Nessuna credenziale, vera o cifrata, viene letta o
   scritta — il file contiene solo un nome e un indirizzo di loopback. */
const { writeFileSync, rmSync } = await import('fs');
const STORE_FINTO = '/tmp/confine-vivo-store-' + process.pid + '.json';
writeFileSync(STORE_FINTO, JSON.stringify({
  __custom: { 'c-prova': { nome: 'Portale di prova', scraper_url: URL_FINTO, attiva: true } },
}), { mode: 0o600 });
process.env.FONTI_STORE = STORE_FINTO;
const SUPER = 'prova@example.invalid';
process.env.SUPER_ADMIN_EMAIL = SUPER;

const { motoRouter } = await import('./moto.js');
const { fontiRouter } = await import('./fonti.js');

// ── Il backend vero, con l'autenticazione sostituita ─────────────────────────
// Non si prova `requireAuth` qui: si prova il confine con lo scraper.
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = { id: 'prova', email: SUPER }; next(); });
app.use('/moto', motoRouter);
app.use('/fonti', fontiRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise(r => server.on('listening', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

const chiedi = async (percorso, opzioni = {}) => {
  const r = await fetch(BASE + percorso, opzioni);
  const testo = await r.text();
  let corpo = null; try { corpo = JSON.parse(testo); } catch {}
  return { http: r.status, corpo, testo };
};

// ═══ GET /moto/ania — la rotta dove la difesa di Allianz veniva annullata ════

await prova('/moto/ania: PORTALE_CAMBIATO non diventa «non trovato»', async () => {
  /* E' la risposta reale di scraper/allianz/quote-service.mjs:981. Il campo del
     messaggio si chiama `errore`; il backend controllava `d.error`. */
  rispondi({
    ok: false, motivo: 'PORTALE_CAMBIATO', targa: 'ZZ000ZZ',
    errore: "Campo targa non trovato sul portale Allianz: la ricerca ANIA non e' partita.",
  });
  const r = await chiedi('/moto/ania?targa=ZZ000ZZ');
  deve(r.http !== 200, 'ha risposto 200 a un portale cambiato');
  deve(!(r.corpo && r.corpo.ok === true), 'ha risposto ok:true su un ok:false dello scraper');
  deve(!(r.corpo && r.corpo.trovato === false && r.corpo.ok === true),
    'un «portale cambiato» e\' stato appiattito in «cercato e non trovato»');
  deve(r.corpo && r.corpo.motivo === 'PORTALE_CAMBIATO', 'il motivo non arriva al frontend: ' + JSON.stringify(r.corpo));
  return 'HTTP ' + r.http + ' · motivo conservato';
});

await prova('/moto/ania: «cercato e non trovato» resta un risultato buono', async () => {
  rispondi({ ok: true, targa: 'ZZ000ZZ', trovato: false, ania: null, campo_targa_compilato: true });
  const r = await chiedi('/moto/ania?targa=ZZ000ZZ');
  deve(r.http === 200, 'un risultato legittimo e\' stato rifiutato: HTTP ' + r.http);
  deve(r.corpo && r.corpo.ok === true && r.corpo.trovato === false, 'il risultato «non trovato» si e\' perso');
  return 'la distinzione regge in entrambe le direzioni';
});

await prova('/moto/ania: un 500 dello scraper non diventa 200', async () => {
  rispondi({ error: 'boom' }, { http: 500 });
  const r = await chiedi('/moto/ania?targa=ZZ000ZZ');
  deve(r.http !== 200, 'un 500 dello scraper e\' uscito come 200');
  deve(!(r.corpo && r.corpo.ok === true), 'un 500 e\' diventato un risultato');
});

await prova('/moto/ania: una risposta non JSON non diventa un risultato', async () => {
  rispondi('<html>502 Bad Gateway</html>', { ct: 'text/html' });
  const r = await chiedi('/moto/ania?targa=ZZ000ZZ');
  deve(r.http !== 200, 'una pagina HTML e\' uscita come 200');
  deve(!(r.corpo && r.corpo.ok === true), 'una pagina HTML e\' diventata un risultato');
});

await prova('/moto/ania: l\'elenco degli endpoint non e\' un risultato', async () => {
  rispondi({ endpoints: ['/status', '/login', '/lookup?targa=..', '/shot'] });
  const r = await chiedi('/moto/ania?targa=ZZ000ZZ');
  deve(r.http !== 200, 'l\'elenco endpoint e\' uscito come 200');
  deve(!(r.corpo && r.corpo.ok === true), 'una rotta sconosciuta e\' diventata un risultato');
});

// ═══ GET /moto/hub-auto — il primo passo del wizard RC Auto ══════════════════
// E' la chiamata che apre il preventivo: da targa recupera veicolo e
// intestatario. Rispondeva SEMPRE 200, anche a scraper spento, e il frontend
// (index.html:13067) controlla solo `!r.ok` → l'errore spariva e la schermata
// restava vuota senza dire niente.

await prova('/moto/hub-auto: scraper spento non diventa 200 con campi vuoti', async () => {
  rispondi({ error: 'Non loggato: fai il login da QUOTO → Fonti.' }, { http: 500 });
  const r = await chiedi('/moto/hub-auto?targa=ZZ000ZZ');
  deve(r.http !== 200, 'un 500 dello scraper e\' uscito come 200 (l\'errore sparisce a schermo)');
  deve(r.corpo && typeof r.corpo.error === 'string' && r.corpo.error.length > 0,
    'il frontend legge `error`: senza, la schermata resta muta — ' + JSON.stringify(r.corpo));
  return 'HTTP ' + r.http;
});

await prova('/moto/hub-auto: un errore applicativo arriva a schermo', async () => {
  rispondi({ error: 'Sessione Plurima scaduta: rifai il login da Fonti.' });
  const r = await chiedi('/moto/hub-auto?targa=ZZ000ZZ');
  deve(r.http !== 200, 'un errore dello scraper e\' uscito come 200');
  deve(r.corpo && /Plurima/.test(r.corpo.error || ''), 'il messaggio dello scraper e\' andato perso: ' + JSON.stringify(r.corpo));
});

await prova('/moto/hub-auto: risposta non JSON non diventa un recupero vuoto', async () => {
  rispondi('<html>gateway</html>', { ct: 'text/html' });
  const r = await chiedi('/moto/hub-auto?targa=ZZ000ZZ');
  deve(r.http !== 200, 'una pagina HTML e\' uscita come 200');
});

await prova('/moto/hub-auto: rotta sconosciuta non diventa un recupero vuoto', async () => {
  rispondi({ endpoints: ['/status', '/hub', '/hubveicolo'] });
  const r = await chiedi('/moto/hub-auto?targa=ZZ000ZZ');
  deve(r.http !== 200, 'l\'elenco endpoint e\' uscito come 200');
});

await prova('/moto/hub-auto: un recupero vero continua a funzionare', async () => {
  /* La forma reale di scraper/italiana /hub (server/moto.js:498-499). */
  rispondi({
    situazione: { data: { tipo_veicolo: 'AUTOVETTURA', prodotto: 'Autovetture', tipo_proprietario: 'PF', legge_familiare: false, situazione_assicurativa: [] } },
    anagrafica: { data: [{ codice_fiscale: 'XXXXXX00X00X000X', cognome: 'ROSSI', nome: 'MARIO', dataset_indirizzo: {} }] },
  });
  const r = await chiedi('/moto/hub-auto?targa=ZZ000ZZ');
  deve(r.http === 200, 'un recupero buono e\' stato rifiutato: HTTP ' + r.http);
  deve(r.corpo && r.corpo.ok === true, 'un recupero buono non e\' stato riconosciuto: ' + JSON.stringify(r.corpo));
  deve(r.corpo.veicolo && r.corpo.veicolo.tipo === 'AUTOVETTURA', 'il veicolo si e\' perso');
  deve(r.corpo.anagrafica && r.corpo.anagrafica.cognome === 'ROSSI', 'l\'anagrafica si e\' persa');
  return 'nessuna regressione sul percorso buono';
});

await prova('/moto/hub-auto: un recupero a mani vuote lo dice', async () => {
  /* Lo scraper risponde bene ma non ha trovato niente: non e' un guasto, ma
     nemmeno un successo da annunciare. Il frontend deve poterlo distinguere. */
  rispondi({ situazione: { data: {} }, anagrafica: { data: [] } });
  const r = await chiedi('/moto/hub-auto?targa=ZZ000ZZ');
  deve(r.corpo && r.corpo.ok === false, 'un recupero vuoto ha detto ok:true');
  return 'HTTP ' + r.http + ' · ok:false';
});

// ═══ POST /moto/quota-auto ═══════════════════════════════════════════════════

await prova('/moto/quota-auto: un errore «errore» non viene ignorato', async () => {
  rispondi({ ok: false, errore: 'Il portale non ha restituito un premio.' });
  const r = await chiedi('/moto/quota-auto', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targa: 'ZZ000ZZ' }),
  });
  deve(r.corpo && r.corpo.ok === false, 'ok:true su una compagnia che non ha quotato');
  const riga = (r.corpo.risultati || [])[0] || {};
  deve(typeof riga.errore === 'string' && /premio/.test(riga.errore),
    'il messaggio scritto «errore» e\' sparito dal risultato: ' + JSON.stringify(riga));
});

await prova('/moto/quota-auto: un 500 dello scraper compare come errore di compagnia', async () => {
  rispondi({ error: 'boom' }, { http: 500 });
  const r = await chiedi('/moto/quota-auto', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targa: 'ZZ000ZZ' }),
  });
  deve(r.corpo && r.corpo.ok === false, 'ok:true con lo scraper a 500');
  const riga = (r.corpo.risultati || [])[0] || {};
  deve(riga.errore, 'il guasto non compare fra i risultati: ' + JSON.stringify(r.corpo));
});

// ═══ I PROXY DEL PANNELLO FONTI ═════════════════════════════════════════════
// Sette rotte di server/fonti.js facevano tutte cosi':
//     const d = await r.json().catch(() => ({})); return res.json(d);
// mai `r.ok`, mai il content-type. Un 500 usciva come 200 con dentro l'errore;
// una pagina HTML usciva come 200 con `{}`.

await prova('/fonti/:id/auto: un 500 dello scraper non diventa 200', async () => {
  rispondi({ error: 'boom' }, { http: 500 });
  const r = await chiedi('/fonti/c-prova/auto?targa=ZZ000ZZ');
  deve(r.http !== 200, 'un 500 e\' uscito come 200');
  deve(r.corpo && r.corpo.error, 'senza messaggio la textarea resta vuota: ' + JSON.stringify(r.corpo));
});

await prova('/fonti/:id/auto: una risposta non JSON non diventa 200 con {}', async () => {
  rispondi('<html>gateway</html>', { ct: 'text/html' });
  const r = await chiedi('/fonti/c-prova/auto?targa=ZZ000ZZ');
  deve(r.http !== 200, 'una pagina HTML e\' uscita come 200');
  deve(!(r.corpo && Object.keys(r.corpo).length === 0), 'e\' uscito un oggetto vuoto invece di un errore');
});

await prova('/fonti/:id/auto: l\'elenco degli endpoint non passa come risultato', async () => {
  rispondi({ endpoints: ['/status', '/login', '/auto?targa=..'] });
  const r = await chiedi('/fonti/c-prova/auto?targa=ZZ000ZZ');
  deve(r.http !== 200, 'una rotta sconosciuta e\' uscita come 200');
  deve(r.corpo && /versione diversa/.test(r.corpo.error || ''), 'il messaggio deve far pensare al deploy');
});

await prova('/fonti/:id/auto: un ok:false con «errore» non passa come risultato', async () => {
  rispondi({ ok: false, motivo: 'PORTALE_CAMBIATO', errore: 'campo targa non identificabile sulla pagina' });
  const r = await chiedi('/fonti/c-prova/auto?targa=ZZ000ZZ');
  deve(r.http !== 200, 'un ok:false e\' uscito come 200');
  deve(r.corpo && r.corpo.motivo === 'PORTALE_CAMBIATO', 'il motivo non arriva al pannello');
});

await prova('/fonti/:id/auto: un risultato buono passa intatto', async () => {
  rispondi({ ok: true, steps: { targa: true, lente: true }, url: 'https://portale.example.invalid/auto' });
  const r = await chiedi('/fonti/c-prova/auto?targa=ZZ000ZZ');
  deve(r.http === 200, 'un risultato buono e\' stato rifiutato: HTTP ' + r.http);
  deve(r.corpo && r.corpo.ok === true && r.corpo.steps, 'il risultato si e\' perso: ' + JSON.stringify(r.corpo));
  return 'nessuna regressione sul percorso buono';
});

await prova('/fonti/:id/preventivo: stesso metro dell\'altro proxy', async () => {
  rispondi({ error: 'Sessione scaduta.' }, { http: 500 });
  const r = await chiedi('/fonti/c-prova/preventivo?targa=ZZ000ZZ');
  deve(r.http !== 200, 'un 500 e\' uscito come 200 su /preventivo');
});

// ═══ LO STATO DELLA FONTE ═══════════════════════════════════════════════════
// `fonti.js:80` traduceva qualunque guasto in 'pronta', che nel pannello e' lo
// STESSO VERDE di 'attiva'.

await prova('mappaScraper: uno scraper spento non e\' «pronta»', async () => {
  const { _diagnosi } = await import('./fonti.js');
  deve(typeof _diagnosi.mappaScraper === 'function', 'mappaScraper non e\' esposto per le prove');
  const s = _diagnosi.mappaScraper({ ok: false, dati: null, da: 'rete' }, true);
  deve(s.stato !== 'pronta', 'uno scraper spento e\' ancora «pronta» (verde nel pannello)');
  deve(s.stato === 'spento', 'atteso spento, trovato ' + s.stato);
});

await prova('mappaScraper: uno stato incerto non e\' verde', async () => {
  const { _diagnosi } = await import('./fonti.js');
  const s = _diagnosi.mappaScraper({ ok: true, dati: { url: 'https://x' }, da: 'rete' }, true);
  deve(s.stato === 'da_verificare', 'atteso da_verificare, trovato ' + s.stato);
});

await prova('mappaScraper: attiva e scaduta restano quelle di prima', async () => {
  const { _diagnosi } = await import('./fonti.js');
  const a = _diagnosi.mappaScraper({ ok: true, dati: { url: 'https://x', loggato: true }, da: 'rete' }, true);
  const b = _diagnosi.mappaScraper({ ok: true, dati: { url: 'https://x', loggato: false }, da: 'rete' }, true);
  const c2 = _diagnosi.mappaScraper({ ok: false, dati: null, da: 'rete' }, false);
  deve(a.stato === 'attiva' && a.url === 'https://x', 'la fonte viva non e\' piu\' attiva: ' + a.stato);
  deve(b.stato === 'scaduta', 'atteso scaduta, trovato ' + b.stato);
  deve(c2.stato === 'non_configurata', 'atteso non_configurata, trovato ' + c2.stato);
  return 'nessuna regressione sugli stati buoni';
});

await prova('mappaScraper: la chiave diversa si distingue dalle credenziali assenti', async () => {
  const { _diagnosi } = await import('./fonti.js');
  const dati = { url: 'https://x', loggato: false, ha_credenziali: false };
  const chiave = _diagnosi.mappaScraper({ ok: true, dati, da: 'rete' }, true, true);
  const assenti = _diagnosi.mappaScraper({ ok: true, dati, da: 'rete' }, true, false);
  deve(chiave.diagnosi === 'credenziali-non-leggibili-dallo-scraper', 'chiave diversa non riconosciuta: ' + chiave.diagnosi);
  deve(assenti.diagnosi === 'credenziali-assenti', 'credenziali assenti non riconosciute: ' + assenti.diagnosi);
  deve(typeof chiave.motivo_stato === 'string' && /FONTI_SECRET/.test(chiave.motivo_stato),
    'la frase che porta alla soluzione non arriva al pannello: ' + chiave.motivo_stato);
});

await prova('perche(): la chiave diversa non manda a cambiare la password', async () => {
  /* E' la diagnosi che l'agente legge quando preme «Verifica accesso» su una
     fonte rossa. Prima diceva «reinseriscile qui sotto e salva» in ENTRAMBI i
     casi — cioe' il consiglio sbagliato proprio quando la password e' giusta e
     il problema e' la chiave di cifratura. */
  const { _diagnosi } = await import('./fonti.js');
  rispondi({ url: 'https://portale.example.invalid/login', loggato: false, ha_credenziali: false });

  const conChiaveDiversa = await _diagnosi.perche(URL_FINTO, true);
  deve(conChiaveDiversa.diagnosi === 'credenziali-non-leggibili-dallo-scraper',
    'chiave diversa non riconosciuta: ' + conChiaveDiversa.diagnosi);
  deve(/FONTI_SECRET/.test(conChiaveDiversa.error || ''), 'la frase non nomina la chiave: ' + conChiaveDiversa.error);
  deve(/NON serve/i.test(conChiaveDiversa.error || ''), 'la frase non dice che reinserire la password e\' inutile');

  const senzaCredenziali = await _diagnosi.perche(URL_FINTO, false);
  deve(senzaCredenziali.diagnosi === 'credenziali-assenti', 'credenziali assenti non riconosciute: ' + senzaCredenziali.diagnosi);
  deve(conChiaveDiversa.error !== senzaCredenziali.error, 'i due casi danno lo stesso messaggio');
  return 'due cause, due frasi, nessun segreto';
});

await prova('perche(): uno scraper muto resta «spento», non «scaduta»', async () => {
  const { _diagnosi } = await import('./fonti.js');
  const p = await _diagnosi.perche('http://127.0.0.1:1');   // porta chiusa
  deve(p.stato === 'spento', 'atteso spento, trovato ' + p.stato);
});

// ── chiusura ─────────────────────────────────────────────────────────────────
await new Promise(r => server.close(r));
await new Promise(r => finto.close(r));
try { rmSync(STORE_FINTO, { force: true }); } catch {}

let ko = 0;
console.log('\nCONFINE VIVO — i router veri davanti a uno scraper finto');
for (const [ok, nome, msg] of esiti) {
  console.log(ok ? '  ok  ' + nome + (msg ? ' — ' + msg : '') : '  X   ' + nome + ' — ' + msg);
  if (!ok) ko++;
}
console.log(`\nCONFINE VIVO: ${esiti.length - ko} superate, ${ko} fallite`);
console.log(`(${chiamate.length} chiamate allo scraper finto su 127.0.0.1:${PORTA_FINTA} — nessun portale reale)\n`);
process.exit(ko === 0 ? 0 : 1);
