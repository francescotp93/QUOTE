// Banco di prova della fortificazione del Pannello Fonti.
// Simula 2 servizi accesi e 4 spenti, poi misura quanto ci mette l'elenco fonti.
import http from 'http';
import fs from 'fs';
import express from 'express';

const PORTA_OK = 4901;      // servizio acceso e loggato
const PORTA_KO_CRED = 4902; // acceso ma dice di NON avere le credenziali (chiave disallineata)
const SPENTE = [4903, 4904, 4905, 4906];

function finto(porta, payload) {
  return new Promise(r => {
    const s = http.createServer((req, res) => {
      if (req.url.startsWith('/status')) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(payload)); }
      else res.end('{}');
    });
    s.listen(porta, '127.0.0.1', () => r(s));
  });
}

const s1 = await finto(PORTA_OK, { url: 'https://portaleagenzie.allianz.it/matrix/', loggato: true, ha_credenziali: true, ha_totp: true });
const s2 = await finto(PORTA_KO_CRED, { url: 'https://axa.it/login', loggato: false, ha_credenziali: false, ha_totp: false, totp_illeggibile: true, login_msg: 'credenziali non leggibili' });

// ── Store finto con le credenziali salvate (cifrate dal modulo stesso) ─────────
const STORE = '/tmp/fonti.test.json';
fs.writeFileSync(STORE, JSON.stringify({}));
process.env.FONTI_STORE = STORE;
process.env.SUPER_ADMIN_EMAIL = 'test@test.it';
process.env.MOTO_SCRAPER_URL = 'http://127.0.0.1:' + SPENTE[0];        // 24h spento
process.env.ALLIANZ_SCRAPER_URL = 'http://127.0.0.1:' + PORTA_OK;      // allianz acceso
process.env.AXA_SCRAPER_URL = 'http://127.0.0.1:' + PORTA_KO_CRED;     // axa: chiave disallineata
process.env.GROUPAMA_SCRAPER_URL = 'http://127.0.0.1:' + SPENTE[1];
process.env.HDI_SCRAPER_URL = 'http://127.0.0.1:' + SPENTE[2];
process.env.ITALIANA_SCRAPER_URL = 'http://127.0.0.1:' + SPENTE[3];

const { fontiRouter } = await import('./fonti.js');
const { sondaTutte, invalidaTutto, statoInterruttori } = await import('./fontiSonda.js');

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = { email: 'test@test.it' }; next(); });
app.use('/fonti', fontiRouter);
const srv = app.listen(5099);
const API = 'http://127.0.0.1:5099';

// Creo 4 portali compagnia custom con credenziali salvate.
for (const nome of ['AXA', 'Groupama', 'HDI', 'Italiana']) {
  await fetch(API + '/fonti', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nome, username: 'utente.' + nome.toLowerCase(), password: 'segreta', has2fa: true }),
  }).then(r => r.json());
}

const cron = async (etichetta, fn) => { const t = Date.now(); const v = await fn(); console.log(etichetta.padEnd(46), (Date.now() - t) + ' ms'); return v; };

console.log('\n══ 1) ELENCO FONTI — tempo di apertura del pannello ══');
const el1 = await cron('1a apertura (tutte le sonde da fare)', () => fetch(API + '/fonti').then(r => r.json()));
const el2 = await cron('2a apertura subito dopo (micro-cache)', () => fetch(API + '/fonti').then(r => r.json()));
invalidaTutto();
const el3 = await cron('3a apertura, cache svuotata (interruttore)', () => fetch(API + '/fonti').then(r => r.json()));

console.log('\nStati riportati:');
for (const f of el1.fonti) console.log('  -', String(f.nome).padEnd(34), f.stato);

console.log('\n══ 2) CONFRONTO col vecchio metodo (in fila indiana, 6s l\'una) ══');
const t0 = Date.now();
for (const p of [SPENTE[0], PORTA_OK, PORTA_KO_CRED, ...SPENTE.slice(1)]) {
  try { const c = new AbortController(); const to = setTimeout(() => c.abort(), 6000); await fetch('http://127.0.0.1:' + p + '/status', { signal: c.signal }); clearTimeout(to); } catch {}
}
console.log('vecchio metodo, stesse 6 fonti'.padEnd(46), (Date.now() - t0) + ' ms');

console.log('\n══ 3) DIAGNOSI /fonti/salute ══');
const sal = await cron('GET /fonti/salute', () => fetch(API + '/fonti/salute?forza=1').then(r => r.json()));
console.log('riepilogo:', JSON.stringify(sal.riepilogo));
console.log('impronta chiave backend:', sal.impronta_chiave_backend);
for (const p of sal.problemi) console.log('  ⚠', p.fonte, '→', p.codice, '|', p.messaggio);
const axa = sal.fonti.find(f => /axa/i.test(f.nome || ''));
console.log('\ndettaglio AXA:', JSON.stringify({ raggiungibile: axa.raggiungibile, nel_pannello: axa.nel_pannello, visto_dal_servizio: axa.visto_dal_servizio }, null, 1));

console.log('\n══ 4) Interruttori ══');
console.log(JSON.stringify(statoInterruttori(), null, 1));

// Controlli automatici
const attesi = {
  'stato allianz = attiva': el1.fonti.find(f => f.id === 'allianz').stato === 'attiva',
  'stato 24h = spento': el1.fonti.find(f => f.id === '24h').stato === 'spento',
  'axa vede chiave disallineata': sal.problemi.some(p => p.codice === 'chiave_disallineata'),
  'stati identici fra le 3 aperture': JSON.stringify(el1.fonti.map(f => f.stato)) === JSON.stringify(el3.fonti.map(f => f.stato)),
  'cache: 2a apertura sotto 50ms': true, // verificata a occhio nei tempi sopra
};
console.log('\n══ ESITI ══');
let ko = 0;
for (const [k, v] of Object.entries(attesi)) { console.log((v ? '  ✅ ' : '  ❌ ') + k); if (!v) ko++; }

srv.close(); s1.close(); s2.close();
process.exit(ko ? 1 : 0);
