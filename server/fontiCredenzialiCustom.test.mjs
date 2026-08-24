// ═══════════════════════════════════════════════════════════════════════════════
//  SALVARE LE CREDENZIALI FUNZIONA PER TUTTE LE FONTI, NON PER DUE
//
//  Le fonti sono di due razze, e la cosa non si vede dal pannello:
//    · le PREDEFINITE (24H, Allianz) stanno nell'elenco FONTI e le loro
//      credenziali si salvano in store[id];
//    · tutte le altre — HDI, Italiana, Groupama, AXA, Prima, Assieasy, Kube,
//      Quotiamo… — sono portali aggiunti dal pannello e vivono in
//      store.__custom[id].
//
//  `POST /:id/credenziali` cercava l'id SOLO fra le predefinite. Su HDI la
//  scheda si apriva, i campi si compilavano, si premeva «Salva credenziali» e
//  rispondeva «Fonte sconosciuta». Undici fonti su tredici.
//
//  Il guasto è di quelli che sfuggono perché il pannello funziona benissimo: è
//  la risposta del server a essere sbagliata, e solo su una rotta. La rotta
//  gemella del codice 2FA, poche righe più sotto, il doppio ramo ce l'ha da
//  sempre — segno che è una dimenticanza, non una scelta.
//
//  Trovato da Francesco usando il pannello, il 21/08/2026.
// ═══════════════════════════════════════════════════════════════════════════════
import http from 'http';
import fs from 'fs';
import express from 'express';

const STORE = '/tmp/fonti.credcustom.test.json';
/* Una fonte «aggiunta dal pannello» (come HDI in produzione) e una predefinita
   (Allianz), così si prova che vale per tutte e due le razze. */
fs.writeFileSync(STORE, JSON.stringify({
  __custom: {
    hdi: { nome: 'HDI', username: 'vecchio-utente', attiva: true, ruolo: 'preventivo' },
  },
}));
process.env.FONTI_STORE = STORE;
process.env.SUPER_ADMIN_EMAIL = 'capo@prova.it';
process.env.FONTI_SECRET = process.env.FONTI_SECRET || 'segreto-di-prova-per-le-credenziali';

const { fontiRouter } = await import('./fonti.js');

const esiti = [];
const prova = (nome, fn) => esiti.push({ nome, fn });
const deve = (c, m) => { if (!c) throw new Error(m); };

const app = express();
app.use(express.json());
app.use((req, res, next) => { req.user = { email: 'capo@prova.it' }; next(); });
app.use('/fonti', fontiRouter);
const srv = http.createServer(app);
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + srv.address().port + '/fonti';

const chiama = (url, opz = {}) => fetch(url, {
  method: opz.method || 'GET',
  headers: { 'Content-Type': 'application/json' },
  body: opz.body ? JSON.stringify(opz.body) : undefined,
}).then(async r => ({ stato: r.status, corpo: await r.json().catch(() => ({})) }));

const suDisco = () => JSON.parse(fs.readFileSync(STORE, 'utf8'));

prova('una fonte aggiunta dal pannello accetta le credenziali', async () => {
  /* È IL CASO DI HDI. Prima rispondeva 404 «Fonte sconosciuta». */
  const r = await chiama(BASE + '/hdi/credenziali', {
    method: 'POST', body: { username: 'age0904fo', password: 'segretissima' },
  });
  deve(r.stato === 200, 'ha risposto ' + r.stato + ': ' + JSON.stringify(r.corpo));
  deve(r.corpo.ok === true, 'non dice di aver salvato: ' + JSON.stringify(r.corpo));
});

prova('e le salva dove la fonte vive davvero', async () => {
  /* Scriverle in store[id] invece che in store.__custom[id] vorrebbe dire
     salvarle in un posto che nessuno legge: risposta verde e login che
     continua a fallire, cioè il modo peggiore di sbagliare. */
  const d = suDisco();
  deve(d.__custom && d.__custom.hdi, 'la fonte custom e\' sparita dallo store');
  deve(d.__custom.hdi.username && d.__custom.hdi.username !== 'vecchio-utente',
    'l\'utente non e\' stato aggiornato dove la fonte vive');
  deve(d.__custom.hdi.password, 'la password non e\' stata salvata dove la fonte vive');
  deve(!d.hdi, 'le ha scritte in store.hdi, dove per una fonte custom non le legge nessuno');
});

prova('le credenziali finiscono cifrate, mai in chiaro', async () => {
  const d = suDisco();
  const testo = JSON.stringify(d);
  deve(!testo.includes('segretissima'), 'la password e\' sul disco in chiaro');
  deve(!testo.includes('age0904fo'), 'l\'utente e\' sul disco in chiaro');
});

prova('anche una fonte predefinita continua a funzionare', async () => {
  /* La correzione non doveva rompere le due che gia' andavano. */
  const r = await chiama(BASE + '/allianz/credenziali', {
    method: 'POST', body: { username: 'utente.allianz', password: 'altra' },
  });
  deve(r.stato === 200, 'ha risposto ' + r.stato + ': ' + JSON.stringify(r.corpo));
  const d = suDisco();
  deve(d.allianz && d.allianz.username, 'la predefinita non e\' finita in store[id]');
});

prova('una fonte che non esiste resta sconosciuta', async () => {
  const r = await chiama(BASE + '/generali/credenziali', {
    method: 'POST', body: { username: 'x', password: 'y' },
  });
  deve(r.stato === 404, 'ha risposto ' + r.stato + ': accetta credenziali per una fonte inventata');
});

prova('senza niente da salvare lo dice, invece di fingere', async () => {
  const r = await chiama(BASE + '/hdi/credenziali', { method: 'POST', body: {} });
  deve(r.stato === 400, 'ha risposto ' + r.stato);
  deve(/Niente da salvare/i.test(r.corpo.error || ''), 'il messaggio non dice cosa manca: ' + r.corpo.error);
});

prova('il codice 2FA gia\' le conosceva entrambe: le due rotte ora concordano', async () => {
  /* È la rotta che aveva il doppio ramo fin dall'inizio. Se un giorno una
     delle due lo perde, questa prova lo vede. */
  const r = await chiama(BASE + '/hdi/codice', { method: 'POST', body: { codice: '123456' } });
  deve(r.stato === 200, '/codice ha risposto ' + r.stato + ' su una fonte custom: ' + JSON.stringify(r.corpo));
});

let ko = 0;
console.log('\nCREDENZIALI — valgono per tutte le fonti');
for (const { nome, fn } of esiti) {
  try { await fn(); console.log('  ok  ' + nome); }
  catch (e) { ko++; console.log('  X   ' + nome + '\n      ' + e.message); }
}
srv.close();
try { fs.unlinkSync(STORE); } catch {}
console.log(`\nCREDENZIALI FONTI: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
