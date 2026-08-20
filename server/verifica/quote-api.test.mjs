// ═══════════════════════════════════════════════════════════════════════════════
//  API DI QUOTAZIONE v1 — il contratto fra IAM, QUOTO e Lab
//
//  Che cosa sorveglia, e perché.
//
//  Il patto è che IAM NON DEVE SAPERE quale prodotto sta chiamando per
//  interpretare la risposta. Se un prodotto risponde con una forma sua, quel
//  patto salta e IAM ricomincia a contenere logica per prodotto — che è
//  esattamente ciò da cui questa architettura sta scappando.
//
//  Qui il provider vero non viene mai chiamato: al suo posto c'è un finto
//  provider che si può far rispondere bene, male o lentamente a comando. Le
//  prove devono girare da riga di comando, senza portali, senza credenziali e
//  senza che nessuno guardi uno schermo — Francesco lavora da telefono.
// ═══════════════════════════════════════════════════════════════════════════════
import http from 'http';
import { creaApiQuotazione } from '../quoteApi.js';
import express from 'express';

const CHIAVE = 'chiave-di-prova';
const esiti = [];
const prova = (nome, fn) => esiti.push({ nome, fn });
const deve = (c, msg) => { if (!c) throw new Error(msg); };

/* Il finto provider: nessuna rete, nessun browser, comportamento a comando. */
function provider(modo) {
  return async () => {
    if (modo === 'lento')      { await new Promise(r => setTimeout(r, 120)); return { ok: true, risultati: [risultatoFinto()] }; }
    if (modo === 'giu')        return { ok: false, errore: 'PROVIDER_UNAVAILABLE', provider: 'hdi', messaggio: 'Sessione HDI scaduta.' };
    if (modo === 'frenato')    return { ok: false, errore: 'PROVIDER_UNAVAILABLE', provider: 'hdi', messaggio: 'Accessi sospesi fino alle 14:30.', riprova_dopo: '2026-08-17T14:30:00Z' };
    if (modo === 'esplode')    throw new Error('crash del provider');
    return { ok: true, risultati: [risultatoFinto()] };
  };
}
const risultatoFinto = () => ({
  compagnia: 'HDI', premio_annuo: 412.5, premio_frazionato: 216.56,
  frazionamento: 'semestrale', garanzie: [{ nome: 'Incendio', inclusa: true }], note: '',
});

async function conServer(modo, fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', creaApiQuotazione({
    chiave: CHIAVE,
    prodotti: { casa: { attivo: true, quota: provider(modo) } },
    log: () => {},
  }));
  const srv = http.createServer(app);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port + '/api/v1';
  try { return await fn(base); } finally { srv.close(); }
}

const chiama = (url, opz = {}) => fetch(url, {
  method: opz.method || 'GET',
  headers: Object.assign({ 'Content-Type': 'application/json' }, opz.headers || {}),
  body: opz.body ? JSON.stringify(opz.body) : undefined,
}).then(async r => ({ stato: r.status, corpo: await r.json().catch(() => ({})) }));

const conChiave = { 'X-Internal-Key': CHIAVE };

/* Attende che una quotazione arrivi a uno stato finale. Le prove non devono
   dipendere da quanto ci mette il provider: dipendono solo dal fatto che ci
   arrivi. */
async function attendi(base, id) {
  for (let i = 0; i < 60; i++) {
    const r = await chiama(base + '/quote/' + id, { headers: conChiave });
    if (r.corpo.stato !== 'in_corso') return r;
    await new Promise(x => setTimeout(x, 50));
  }
  throw new Error('la quotazione non è mai arrivata a uno stato finale');
}

// ── 1. La chiave interna ─────────────────────────────────────────────────────
prova('senza chiave non si entra', () => conServer('ok', async (base) => {
  const r = await chiama(base + '/quote/casa', { method: 'POST', body: { mq: 100 } });
  deve(r.stato === 401, 'ha risposto ' + r.stato + ' invece di 401');
  deve(r.corpo.success === false, 'non usa la forma di errore concordata');
  deve(r.corpo.error_code === 'AUTH_FAILED', 'error_code è «' + r.corpo.error_code + '» invece di AUTH_FAILED');
}));

prova('con la chiave sbagliata non si entra', () => conServer('ok', async (base) => {
  const r = await chiama(base + '/quote/casa', { method: 'POST', headers: { 'X-Internal-Key': 'sbagliata' }, body: { mq: 100 } });
  deve(r.stato === 401, 'ha risposto ' + r.stato);
  deve(r.corpo.error_code === 'AUTH_FAILED', 'error_code sbagliato: ' + r.corpo.error_code);
}));

// ── 2. La forma della risposta, uguale per tutti ─────────────────────────────
prova('la quotazione accettata risponde 202 con un identificativo', () => conServer('ok', async (base) => {
  const r = await chiama(base + '/quote/casa', { method: 'POST', headers: conChiave, body: { mq: 100 } });
  deve(r.stato === 202, 'ha risposto ' + r.stato + ' invece di 202');
  deve(r.corpo.success === true, 'success non è true');
  deve(typeof r.corpo.quote_id === 'string' && r.corpo.quote_id.length > 10, 'quote_id assente o non valido');
  deve(r.corpo.prodotto === 'casa', 'prodotto è «' + r.corpo.prodotto + '»');
  deve(r.corpo.stato === 'in_corso', 'stato iniziale è «' + r.corpo.stato + '»');
  deve(Array.isArray(r.corpo.risultati), 'risultati non è un elenco');
  deve(typeof r.corpo.generato_il === 'string', 'manca generato_il');
}));

prova('a lavoro finito i risultati hanno tutti i campi concordati', () => conServer('lento', async (base) => {
  const p = await chiama(base + '/quote/casa', { method: 'POST', headers: conChiave, body: { mq: 100 } });
  const r = await attendi(base, p.corpo.quote_id);
  deve(r.corpo.stato === 'completo', 'stato finale «' + r.corpo.stato + '»');
  deve(r.corpo.success === true, 'success non è true');
  deve(r.corpo.risultati.length === 1, 'risultati: ' + r.corpo.risultati.length);
  const x = r.corpo.risultati[0];
  for (const c of ['compagnia', 'premio_annuo', 'premio_frazionato', 'frazionamento', 'garanzie', 'note']) {
    deve(c in x, 'manca il campo «' + c + '» nel risultato');
  }
  deve(typeof x.premio_annuo === 'number', 'premio_annuo non è un numero');
  deve(Array.isArray(x.garanzie), 'garanzie non è un elenco');
}));

// ── 3. Gli errori, nella forma concordata ────────────────────────────────────
prova('input non valido si ferma subito, senza disturbare il provider', () => conServer('ok', async (base) => {
  const r = await chiama(base + '/quote/casa', { method: 'POST', headers: conChiave, body: {} });
  deve(r.stato === 400, 'ha risposto ' + r.stato + ' invece di 400');
  deve(r.corpo.success === false && r.corpo.error_code === 'INVALID_INPUT', 'error_code: ' + r.corpo.error_code);
  deve(typeof r.corpo.message === 'string' && r.corpo.message.length > 5, 'il messaggio non dice cosa manca');
}));

prova('un prodotto che non esiste non finge di esistere', () => conServer('ok', async (base) => {
  const r = await chiama(base + '/quote/motor', { method: 'POST', headers: conChiave, body: { targa: 'AA000BB' } });
  deve(r.stato === 404, 'ha risposto ' + r.stato);
  deve(r.corpo.error_code === 'INVALID_INPUT', 'error_code: ' + r.corpo.error_code);
}));

prova('provider giù: errore leggibile, con il nome del provider', () => conServer('giu', async (base) => {
  const p = await chiama(base + '/quote/casa', { method: 'POST', headers: conChiave, body: { mq: 100 } });
  const r = await attendi(base, p.corpo.quote_id);
  deve(r.corpo.stato === 'fallito', 'stato «' + r.corpo.stato + '»');
  deve(r.corpo.success === false, 'success non è false');
  deve(r.corpo.error_code === 'PROVIDER_UNAVAILABLE', 'error_code: ' + r.corpo.error_code);
  deve(r.corpo.provider === 'hdi', 'provider: ' + r.corpo.provider);
}));

prova('provider frenato: dice QUANDO riprovare', () => conServer('frenato', async (base) => {
  /* Senza questo dato IAM ritenta subito e brucia i tentativi che fanno
     bloccare l'utenza dell'agenzia dalla compagnia. È il motivo per cui il
     campo esiste. */
  const p = await chiama(base + '/quote/casa', { method: 'POST', headers: conChiave, body: { mq: 100 } });
  const r = await attendi(base, p.corpo.quote_id);
  deve(r.corpo.error_code === 'PROVIDER_UNAVAILABLE', 'error_code: ' + r.corpo.error_code);
  deve(typeof r.corpo.riprova_dopo === 'string', 'non dice quando riprovare');
}));

prova('se il provider esplode, la risposta resta nella forma concordata', () => conServer('esplode', async (base) => {
  /* Un crash non deve produrre una pagina di errore di Express: IAM si
     aspetta sempre lo stesso involucro, anche quando le cose vanno male. */
  const p = await chiama(base + '/quote/casa', { method: 'POST', headers: conChiave, body: { mq: 100 } });
  const r = await attendi(base, p.corpo.quote_id);
  deve(r.corpo.success === false, 'success non è false');
  deve(['PROVIDER_UNAVAILABLE', 'TIMEOUT'].includes(r.corpo.error_code), 'error_code: ' + r.corpo.error_code);
  deve(!/crash del provider/.test(JSON.stringify(r.corpo)), 'il messaggio interno del guasto esce verso chi chiama');
}));

prova('un identificativo sconosciuto non inventa una risposta', () => conServer('ok', async (base) => {
  const r = await chiama(base + '/quote/00000000-0000-0000-0000-000000000000', { headers: conChiave });
  deve(r.stato === 404, 'ha risposto ' + r.stato);
  deve(r.corpo.success === false, 'non usa la forma di errore');
}));

// ── 4. L'elenco prodotti: spegnere il motor non tocca IAM ────────────────────
prova('l\'elenco prodotti dice cosa è attivo', () => conServer('ok', async (base) => {
  const r = await chiama(base + '/products', { headers: conChiave });
  deve(r.stato === 200, 'ha risposto ' + r.stato);
  deve(r.corpo.success === true, 'success non è true');
  deve(Array.isArray(r.corpo.prodotti), 'prodotti non è un elenco');
  const casa = r.corpo.prodotti.find(p => p.codice === 'casa');
  deve(casa, 'casa non compare nell\'elenco');
  deve(casa.attivo === true, 'casa non risulta attiva');
}));

// ── esecuzione ───────────────────────────────────────────────────────────────
let ko = 0;
console.log('\nAPI DI QUOTAZIONE v1 — contratto');
for (const { nome, fn } of esiti) {
  try { await fn(); console.log('  ok  ' + nome); }
  catch (e) { console.log('  X   ' + nome + ' — ' + e.message); ko++; }
}
console.log(`\nAPI QUOTAZIONE: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
