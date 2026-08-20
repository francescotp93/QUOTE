// ═══════════════════════════════════════════════════════════════════════════════
//  API v1 DELLE FONTI — il pannello portali, chiamabile da IAM
//
//  Che cosa sorveglia, e perché.
//
//  1. Le credenziali dei portali compagnia sono la cosa più delicata che
//     abbiamo. La chiave interna dice «sono IAM», non dice «è stato Tizio»:
//     ogni scrittura deve portare con sé chi ha premuto (X-Operatore), e
//     senza deve essere rifiutata. Questa è la prova che tiene in piedi la
//     decisione del 20/08/2026.
//  2. Lo strato v1 non riscrive il pannello: gli passa davanti. Se domani una
//     rotta del pannello cambia nome, qui deve diventare rosso — altrimenti
//     l'API risponde 404 in produzione e le prove restano verdi.
//  3. Le password non escono mai dalla API.
//
//  Il pannello vero non viene toccato: leggerebbe e scriverebbe fonti.store.json
//  e sonderebbe gli scraper. Al suo posto c'è un pannello finto con le stesse
//  rotte. Che siano DAVVERO le stesse lo verifica la prova 2, leggendo
//  server/fonti.js.
// ═══════════════════════════════════════════════════════════════════════════════
import http from 'http';
import fs from 'fs';
import path from 'path';
import express from 'express';
import { Router } from 'express';
import { fileURLToPath } from 'url';
import { creaApiFonti } from '../fontiApi.js';

const RADICE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CHIAVE = 'chiave-di-prova';
const ADMIN = 'capo@esempio.it';
const esiti = [];
const prova = (nome, fn) => esiti.push({ nome, fn });
const deve = (c, msg) => { if (!c) throw new Error(msg); };

/* Il pannello finto. Ha lo stesso cancello del vero (solo Super Admin, letto da
   req.user.email): serve a dimostrare che lo strato v1 lo supera davvero,
   altrimenti in produzione risponderebbe 403 a tutto. */
function pannelloFinto(registro, modo) {
  const r = Router();
  r.use((req, res, next) => {
    if ((req.user && req.user.email) !== ADMIN) return res.status(403).json({ error: 'Riservato al Super Admin.' });
    next();
  });
  r.get('/', (req, res) => res.json({ ok: true, fonti: [
    { id: 'allianz', nome: 'Allianz', stato: 'pronta', ha_password: true, username: 'ma***@x.it' },
    { id: 'axa', nome: 'AXA', stato: 'non_configurata', ha_password: false, username: null },
  ] }));
  r.get('/salute', (req, res) => res.json({ ok: true, riepilogo: { totale: 2 }, forzato: req.query.forza === '1', fonti: [] }));
  r.post('/:id/verifica', (req, res) => res.json({ ok: true, esito: 'credenziali valide' }));
  r.post('/:id/accedi', (req, res) => {
    if (modo === 'giu') return res.status(502).json({ error: 'Servizio della fonte non raggiungibile.' });
    registro.push('accedi:' + req.params.id);
    res.json({ ok: true, step: 'credenziali', running: true, msg: 'Apro il portale…' });
  });
  r.get('/:id/loginstate', (req, res) => res.json(modo && modo.loginstate ? modo.loginstate : { step: 'attesa_otp', running: false, msg: 'Inserisci il codice.' }));
  r.post('/:id/conferma-codice', (req, res) => {
    if (!(req.body && req.body.codice)) return res.status(400).json({ error: 'Codice obbligatorio.' });
    res.json({ ok: true, loggato: true, step: 'loggato' });
  });
  r.post('/:id/altro-codice', (req, res) => res.json({ ok: true, inviato: true }));
  r.post('/', (req, res) => { registro.push('crea:' + (req.body && req.body.nome)); res.json({ ok: true, id: 'c-nuova' }); });
  r.put('/:id', (req, res) => { registro.push('modifica:' + req.params.id); res.json({ ok: true }); });
  r.delete('/:id', (req, res) => { registro.push('cancella:' + req.params.id); res.json({ ok: true }); });
  r.post('/:id/credenziali', (req, res) => { registro.push('credenziali:' + req.params.id); res.json({ ok: true, salvate: true }); });
  r.delete('/:id/credenziali', (req, res) => { registro.push('togli-credenziali:' + req.params.id); res.json({ ok: true }); });
  return r;
}

function vigilanzaFinta() {
  const r = Router();
  r.use((req, res, next) => {
    if ((req.user && req.user.email) !== ADMIN) return res.status(403).json({ error: 'Riservato al Super Admin.' });
    next();
  });
  r.get('/', (req, res) => res.json({ ok: true, attiva: true, giri_fatti: 7 }));
  r.post('/giro', (req, res) => res.json({ ok: true, controllate: 3 }));
  return r;
}

async function conServer(modo, fn) {
  const registro = [], log = [];
  const app = express();
  app.use(express.json());
  app.use('/api/v1/fonti', creaApiFonti({
    pannello: pannelloFinto(registro, modo),
    vigilanza: vigilanzaFinta(),
    superAdmin: ADMIN,
    chiave: CHIAVE,
    log: (r) => log.push(r),
  }));
  const srv = http.createServer(app);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port + '/api/v1/fonti';
  try { return await fn(base, registro, log); } finally { srv.close(); }
}

const chiama = (url, opz = {}) => fetch(url, {
  method: opz.method || 'GET',
  headers: Object.assign({ 'Content-Type': 'application/json' }, opz.headers || {}),
  body: opz.body ? JSON.stringify(opz.body) : undefined,
}).then(async r => ({ stato: r.status, corpo: await r.json().catch(() => ({})) }));

const conChiave = { 'X-Internal-Key': CHIAVE };
const conOperatore = { 'X-Internal-Key': CHIAVE, 'X-Operatore': 'u-77 francesco' };

// ── 1. La porta ──────────────────────────────────────────────────────────────
prova('senza chiave interna non si entra', () => conServer(null, async (base) => {
  const r = await chiama(base);
  deve(r.stato === 401, 'ha risposto ' + r.stato + ' invece di 401');
  deve(r.corpo.error_code === 'AUTH_FAILED', 'error_code: ' + r.corpo.error_code);
}));

prova('il cancello Super Admin del pannello non blocca la chiamata interna', () => conServer(null, async (base) => {
  /* Il pannello vero risponde 403 a chi non e' il Super Admin, leggendo
     req.user.email. Lo strato v1 non ha un utente: se non lo dichiarasse,
     ogni rotta risponderebbe «Riservato al Super Admin» e l'API sarebbe
     inutile pur essendo montata. */
  const r = await chiama(base, { headers: conChiave });
  deve(r.stato === 200, 'ha risposto ' + r.stato + ': ' + JSON.stringify(r.corpo).slice(0, 120));
  deve(Array.isArray(r.corpo.fonti), 'non ha restituito l\'elenco fonti');
}));

// ── 2. L'involucro, uguale a quello delle quotazioni ─────────────────────────
prova('la risposta ha l\'involucro concordato, non quello del pannello', () => conServer(null, async (base) => {
  const r = await chiama(base, { headers: conChiave });
  deve(r.corpo.success === true, 'manca success:true');
  deve(typeof r.corpo.generato_il === 'string' && r.corpo.generato_il.includes('T'), 'manca generato_il');
  deve(r.corpo.ok === undefined, 'il vecchio campo «ok» del pannello e\' uscito lo stesso: due dialetti nella stessa risposta');
}));

prova('la query arriva fino al pannello', () => conServer(null, async (base) => {
  const r = await chiama(base + '/salute?forza=1', { headers: conChiave });
  deve(r.corpo.forzato === true, '?forza=1 non e\' arrivato: la diagnosi leggerebbe sempre la cache');
}));

// ── 3. Le credenziali: serve un nome, non solo la chiave ─────────────────────
const SCRITTURE_PROVATE = [
  ['POST', ''], ['PUT', '/allianz'], ['DELETE', '/allianz'],
  ['POST', '/allianz/credenziali'], ['DELETE', '/allianz/credenziali'],
];

/* LE FORME STORTE SONO LA PARTE CHE CONTA, E MANCAVA.
   Il 20/08/2026 una revisione avversariale ha riprodotto questo con un server
   vero: il cancello confrontava il percorso con espressioni ancorate e
   sensibili alle maiuscole, mentre il router di Express — di suo — ignora la
   barra finale e compila i percorsi con il flag «i». Quattro rotte di
   scrittura su cinque si aprivano con la SOLA chiave interna, e nel registro
   non restava il nome di nessuno.
   Le prove qui sotto erano tutte verdi lo stesso, perché provavano solo la
   forma esatta. Una prova che guarda solo la strada dritta non sorveglia una
   porta: sorveglia il corridoio davanti alla porta. */
const STORTE = (r) => (r
  ? [r + '/', r + '//', r.toUpperCase(), r.replace(/\/([a-z])/g, (m, c) => '/' + c.toUpperCase())]
  : ['/']);

for (const [metodo, rotta] of SCRITTURE_PROVATE) {
  for (const storta of [...new Set(STORTE(rotta))].filter((x) => x !== rotta)) {
    prova('nemmeno storta si scrive: ' + metodo + ' ' + (storta || '/'), () => conServer(null, async (base, registro) => {
      const r = await chiama(base + storta, { method: metodo, headers: conChiave, body: { nome: 'Prova', password: 'segreta' } });
      deve(registro.length === 0,
        'la scrittura e\' arrivata al pannello passando da «' + storta + '»: ' + registro.join(', '));
      deve(r.stato === 403 || r.stato === 404,
        'ha risposto ' + r.stato + ': o si rifiuta (403) o la rotta non esiste (404), ma non si esegue');
    }));
  }
}

for (const [metodo, rotta] of SCRITTURE_PROVATE) {
  prova('senza X-Operatore non si scrive: ' + metodo + ' ' + (rotta || '/'), () => conServer(null, async (base, registro) => {
    const r = await chiama(base + rotta, { method: metodo, headers: conChiave, body: { nome: 'Prova', password: 'segreta' } });
    deve(r.stato === 403, 'ha risposto ' + r.stato + ' invece di 403');
    deve(r.corpo.error_code === 'FORBIDDEN', 'error_code: ' + r.corpo.error_code);
    deve(registro.length === 0, 'la scrittura e\' arrivata al pannello lo stesso: ' + registro.join(', '));
  }));
}

prova('con X-Operatore si scrive, e il nome finisce nel registro', () => conServer(null, async (base, registro, log) => {
  const r = await chiama(base + '/allianz/credenziali', { method: 'POST', headers: conOperatore, body: { password: 'segreta' } });
  deve(r.stato === 200, 'ha risposto ' + r.stato);
  deve(registro.includes('credenziali:allianz'), 'la scrittura non e\' arrivata al pannello');
  const riga = log.find(x => x.evento === 'scrittura_fonti');
  deve(riga, 'la scrittura non e\' finita nel registro: nessuna traccia di chi ha cambiato una password');
  deve(String(riga.operatore).includes('u-77'), 'il registro non dice chi e\' stato: ' + JSON.stringify(riga));
}));

prova('leggere e far accedere NON richiedono X-Operatore', () => conServer(null, async (base) => {
  /* La vigilanza automatica gira da sola, di notte, e un operatore non ce
     l'ha. Se «accedi» chiedesse un nome, il rientro automatico delle
     sessioni smetterebbe di funzionare — e nessuno se ne accorgerebbe
     finche' una compagnia non risulta scollegata al mattino. */
  const a = await chiama(base + '/allianz/accedi', { method: 'POST', headers: conChiave });
  deve(a.stato === 200, 'accedi ha risposto ' + a.stato);
  const b = await chiama(base + '/salute', { headers: conChiave });
  deve(b.stato === 200, 'salute ha risposto ' + b.stato);
}));

// ── 4. L'accesso guidato: cinque stati, non dieci ────────────────────────────
const PASSI_ATTESI = [
  [{ step: 'credenziali', running: true }, 'in_corso'],
  [{ step: 'attesa_otp', running: false }, 'serve_codice'],
  [{ step: 'loggato' }, 'completo'],
  [{ loggato: true, step: 'qualcosa_di_nuovo' }, 'completo'],
  [{ step: 'non_loggato' }, 'fallito'],
  [{ step: 'timeout_otp' }, 'fallito'],
  [{ step: 'error' }, 'fallito'],
  [{ step: 'pronto' }, 'pronto'],
  [{ step: 'passo_mai_visto', running: true }, 'in_corso'],
];
for (const [grezzo, atteso] of PASSI_ATTESI) {
  prova('l\'accesso «' + (grezzo.step || '?') + '» si legge come «' + atteso + '»', () => conServer({ loginstate: grezzo }, async (base) => {
    const r = await chiama(base + '/allianz/accesso', { headers: conChiave });
    deve(r.stato === 200, 'ha risposto ' + r.stato);
    deve(r.corpo.stato === atteso, 'stato «' + r.corpo.stato + '» invece di «' + atteso + '»');
    deve(typeof r.corpo.passo_tecnico === 'string', 'il passo grezzo non e\' piu\' leggibile: senza, un guasto non si diagnostica');
  }));
}

prova('un passo sconosciuto e fermo non viene chiamato «in corso» per sempre', () => conServer({ loginstate: { step: '', running: false } }, async (base) => {
  const r = await chiama(base + '/allianz/accesso', { headers: conChiave });
  deve(r.corpo.stato === 'fallito', 'stato: ' + r.corpo.stato + ' — il pannello resterebbe a girare all\'infinito');
}));

prova('l\'accesso si avvia e non aspetta l\'uomo che legge l\'SMS', () => conServer(null, async (base) => {
  const inizio = Date.now();
  const r = await chiama(base + '/allianz/accedi', { method: 'POST', headers: conChiave });
  deve(r.stato === 200, 'ha risposto ' + r.stato);
  deve(Date.now() - inizio < 3000, 'la chiamata e\' rimasta appesa: ' + (Date.now() - inizio) + 'ms');
}));

// ── 5. Gli errori, con il loro codice ────────────────────────────────────────
prova('una fonte che non esiste risponde NOT_FOUND', () => conServer(null, async (base) => {
  const r = await chiama(base + '/inesistente', { headers: conChiave });
  deve(r.stato === 404, 'ha risposto ' + r.stato);
  deve(r.corpo.error_code === 'NOT_FOUND', 'error_code: ' + r.corpo.error_code);
}));

prova('una fonte che esiste si legge da sola', () => conServer(null, async (base) => {
  const r = await chiama(base + '/allianz', { headers: conChiave });
  deve(r.stato === 200, 'ha risposto ' + r.stato);
  deve(r.corpo.fonte && r.corpo.fonte.id === 'allianz', 'non ha restituito la fonte: ' + JSON.stringify(r.corpo).slice(0, 120));
}));

prova('servizio della fonte giù: PROVIDER_UNAVAILABLE, non «non trovato»', () => conServer('giu', async (base) => {
  const r = await chiama(base + '/allianz/accedi', { method: 'POST', headers: conChiave });
  deve(r.stato === 502, 'ha risposto ' + r.stato);
  deve(r.corpo.error_code === 'PROVIDER_UNAVAILABLE', 'error_code: ' + r.corpo.error_code);
  deve(r.corpo.success === false, 'non usa la forma di errore');
}));

prova('dati mancanti: INVALID_INPUT, e il messaggio dice cosa manca', () => conServer(null, async (base) => {
  const r = await chiama(base + '/allianz/codice', { method: 'POST', headers: conChiave, body: {} });
  deve(r.stato === 400, 'ha risposto ' + r.stato);
  deve(r.corpo.error_code === 'INVALID_INPUT', 'error_code: ' + r.corpo.error_code);
  deve(String(r.corpo.message).toLowerCase().includes('codice'), 'il messaggio non dice cosa manca: ' + r.corpo.message);
}));

// ── 6. La vigilanza ──────────────────────────────────────────────────────────
prova('la vigilanza si legge e si può far girare adesso', () => conServer(null, async (base) => {
  const a = await chiama(base + '/vigilanza', { headers: conChiave });
  deve(a.stato === 200 && a.corpo.giri_fatti === 7, 'stato vigilanza: ' + JSON.stringify(a.corpo).slice(0, 120));
  const b = await chiama(base + '/vigilanza/giro', { method: 'POST', headers: conChiave });
  deve(b.stato === 200 && b.corpo.controllate === 3, 'giro: ' + JSON.stringify(b.corpo).slice(0, 120));
}));

prova('«vigilanza» non viene scambiata per il nome di una fonte', () => conServer(null, async (base) => {
  /* /:id sta subito sotto: se fosse dichiarata prima, /vigilanza finirebbe
     nella rotta generica e risponderebbe «fonte inesistente». E' lo stesso
     inciampo che il pannello vero ha gia' avuto con /fonti/vigilanza. */
  const r = await chiama(base + '/vigilanza', { headers: conChiave });
  deve(r.corpo.error_code !== 'NOT_FOUND', 'la vigilanza e\' stata trattata come una fonte');
}));

// ── 7. Le rotte chiamate esistono davvero nel pannello vero ──────────────────
prova('lo strato v1 chiama rotte che il pannello ha davvero', () => {
  /* Il pannello finto qui sopra le ha tutte per costruzione. Se una rotta del
     pannello VERO cambiasse nome, le prove resterebbero verdi e l'API
     risponderebbe 404 in produzione. Questa e' l'unica prova che guarda il
     file vero. */
  const strato = fs.readFileSync(path.join(RADICE, 'fontiApi.js'), 'utf8');
  const pannello = fs.readFileSync(path.join(RADICE, 'fonti.js'), 'utf8');
  const vigilanza = fs.readFileSync(path.join(RADICE, 'fontiWatchdog.js'), 'utf8');

  /* Le code fisse che lo strato aggiunge all'id: '/' + req.params.id + '/xxx' */
  const code = [...strato.matchAll(/req\.params\.id \+ '\/([a-z-]+)'/g)].map(m => m[1]);
  deve(code.length >= 5, 'non ho trovato le rotte chiamate dallo strato (ne ho viste ' + code.length + ')');
  for (const c of new Set(code)) {
    deve(new RegExp("fontiRouter\\.(get|post|put|delete)\\('/:id/" + c + "'").test(pannello),
      'lo strato chiama /:id/' + c + ' ma il pannello non ce l\'ha piu\': in produzione sarebbe un 404');
  }
  for (const r of ['/salute']) {
    deve(pannello.includes("fontiRouter.get('" + r + "'"), 'il pannello non ha piu\' ' + r);
  }
  deve(/vigilanzaRouter\.get\('\/'/.test(vigilanza), 'la vigilanza non ha piu\' la rotta di stato');
  deve(/vigilanzaRouter\.post\('\/giro'/.test(vigilanza), 'la vigilanza non ha piu\' il giro a richiesta');
});

// ── 8. I segreti restano dentro ──────────────────────────────────────────────
prova('le password non escono dalla API', () => conServer(null, async (base) => {
  const r = await chiama(base, { headers: conChiave });
  const testo = JSON.stringify(r.corpo);
  deve(!/"password"\s*:/.test(testo), 'una password e\' uscita nella risposta');
  deve(/ha_password/.test(testo), 'non si capisce piu\' se una fonte ha la password: il pannello non saprebbe cosa disegnare');
}));

// ── esecuzione ───────────────────────────────────────────────────────────────
let ko = 0;
console.log('\nAPI v1 — FONTI');
for (const { nome, fn } of esiti) {
  try { await fn(); console.log('  ok  ' + nome); }
  catch (e) { ko++; console.log('  X   ' + nome + '\n      ' + e.message); }
}
console.log(`\nAPI FONTI: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
