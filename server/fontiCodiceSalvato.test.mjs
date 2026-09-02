// ═══════════════════════════════════════════════════════════════════════════════
//  IL CODICE CHE DIGITI DEVE ESSERE SALVATO — anche per le fonti predefinite
//
//  PERCHE' ESISTE
//    Il 2 settembre 2026 il server ha detto questo, di Allianz:
//
//      codice_ts: 2026-06-23
//      «il codice manuale nel pannello e' stato inserito 6.107.285 secondi fa:
//       un codice monouso ne vive 30. Non lo provo nemmeno.»
//
//    Sei milioni di secondi sono due mesi e mezzo. Francesco stava digitando un
//    codice fresco, e il servizio guardava il timbro di un codice di GIUGNO —
//    perche' /conferma-codice cercava la fonte solo fra le custom (__custom) e
//    Allianz e' una predefinita (store.allianz). Il codice nuovo non veniva mai
//    scritto, il timbro non si aggiornava mai, e ogni tentativo moriva prima di
//    partire dando la colpa al segreto TOTP.
//
//    E' la rotta gemella di /credenziali, che il doppio ramo lo aveva gia'
//    guadagnato ad agosto per lo stesso identico motivo. Questa prova esiste
//    perche' non ci sia una terza volta.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import crypto from 'crypto';
import express from 'express';
import http from 'http';

const STORE = '/tmp/fonti.codicesalvato.test.json';
try { fs.unlinkSync(STORE); } catch {}
process.env.FONTI_STORE = STORE;
process.env.FONTI_SECRET = 'chiave-di-prova';
// Nessuno scraper in ascolto: /conferma-codice deve SALVARE lo stesso, prima di
// bussare. Se salvasse solo a scraper raggiungibile, il codice andrebbe perso
// proprio quando serve di piu'.
process.env.ALLIANZ_SCRAPER_URL = 'http://127.0.0.1:9';
process.env.GROUPAMA_SCRAPER_URL = 'http://127.0.0.1:9';

const leggi = () => { try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch { return {}; } };
const apri = b => { try {
  const K = crypto.createHash('sha256').update(process.env.FONTI_SECRET).digest();
  const r = Buffer.from(String(b).slice(3), 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', K, r.subarray(0, 12));
  d.setAuthTag(r.subarray(12, 28));
  return Buffer.concat([d.update(r.subarray(28)), d.final()]).toString('utf8');
} catch { return null; } };

const { fontiRouter } = await import('./fonti.js');
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = { email: 'francesco.oddo199307@gmail.com' }; next(); });
app.use('/fonti', fontiRouter);
const srv = await new Promise(r => { const s = http.createServer(app).listen(0, '127.0.0.1', () => r(s)); });
const BASE = 'http://127.0.0.1:' + srv.address().port;
const chiama = async (via, corpo) => {
  const r = await fetch(BASE + via, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
  return { stato: r.status, dati: await r.json().catch(() => ({})) };
};

const esiti = [];
const prova = async (n, f) => { try { esiti.push([true, n, (await f()) || '']); } catch (e) { esiti.push([false, n, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

// Punto di partenza: la situazione vera del server — un codice vecchio col suo timbro.
const GIUGNO = Date.parse('2026-06-23T16:01:35.694Z');
fs.writeFileSync(STORE, JSON.stringify({ allianz: { codice: 'v1:vecchio', codice_ts: GIUGNO } }));

await prova('per una fonte PREDEFINITA il codice viene salvato', async () => {
  const prima = Date.now();
  await chiama('/fonti/allianz/conferma-codice', { codice: '713696' });
  const s = leggi().allianz || {};
  deve(apri(s.codice) === '713696', 'il codice digitato non e\' finito nello store (c\'e\' ancora quello vecchio)');
  deve(s.codice_ts >= prima, 'il timbro e\' rimasto quello di giugno: il codice nuovo verra\' scartato per vecchiaia');
  return 'niente piu\' codici valutati sulla data di un altro';
});

await prova('il timbro rende il codice FRESCO per chi lo controlla', async () => {
  // La regola che ha bloccato tutto: oltre 90 secondi un codice monouso e' morto.
  const s = leggi().allianz || {};
  const eta = Date.now() - Number(s.codice_ts || 0);
  deve(eta < 90 * 1000, 'appena salvato risulta gia\' vecchio di ' + Math.round(eta / 1000) + 's');
  return 'appena digitato = appena digitato';
});

await prova('e il pannello lo vede in attesa', async () => {
  const r = await fetch(BASE + '/fonti');
  const d = await r.json().catch(() => ({}));
  const a = (d.fonti || []).find(x => x.id === 'allianz');
  deve(a, 'Allianz non compare nell\'elenco');
  deve(a.codice_in_attesa === true, 'la scheda non si apre da sola sul codice appena messo');
  return 'la scheda si apre dov\'e\' il lavoro';
});

await prova('le fonti CUSTOM continuano a funzionare come prima', async () => {
  const st = leggi(); st.__custom = { groupama: { nome: 'Groupama', username: 'v1:x' } };
  fs.writeFileSync(STORE, JSON.stringify(st));
  await chiama('/fonti/groupama/conferma-codice', { codice: '112233' });
  const g = (leggi().__custom || {}).groupama || {};
  deve(apri(g.codice) === '112233', 'la fonte custom ha smesso di salvare il codice');
  deve(g.codice_ts > 0, 'la fonte custom non prende il timbro');
  return 'il ramo che gia\' andava non e\' stato rotto per aggiustare l\'altro';
});

await prova('una fonte che non esiste non inventa una riga nello store', async () => {
  await chiama('/fonti/non-esiste/conferma-codice', { codice: '999999' });
  deve(!leggi()['non-esiste'], 'ha creato una fonte fantasma');
  return 'si scrive solo dove c\'e\' davvero qualcosa';
});

srv.close();
const ko = esiti.filter(e => !e[0]);
console.log('\n── Il codice digitato viene salvato ─────────────────────────');
for (const [ok, n, d] of esiti) console.log((ok ? '  ✅ ' : '  ❌ ') + n + (d ? ' — ' + d : ''));
console.log(ko.length ? '\n🔴 ' + ko.length + ' prove fallite su ' + esiti.length : '\n🟢 ' + esiti.length + '/' + esiti.length + ' prove superate');
process.exit(ko.length ? 1 : 0);
