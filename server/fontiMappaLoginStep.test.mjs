// ═══════════════════════════════════════════════════════════════════════════════
//  IL PALLINO NON RESTA GRIGIO SU UNA SESSIONE VIVA (caso Groupama)
//
//  Groupama, a sessione attiva, può rispondere a /status con loggato==null quando
//  la verifica ISA è transitoria — ma nella STESSA risposta porta login_step:
//  'loggato' (l'esito dell'ultimo login andato a buon fine). Prima mappaScraper
//  guardava solo `loggato`, quindi il pallino diventava «sconosciuto» (grigio) su
//  una fonte in realtà dentro: «Controlla stato» diceva attiva, il pallino no.
//
//  Regola: il «non lo so» del contenuto si può risolvere con l'esito dell'ultimo
//  login SOLO se lo scraper lo dichiara ('loggato') e non c'è un login in corso.
//  Un loggato:false ESPLICITO resta 'scaduta' — «non lo so» non diventa mai «sì»
//  per magia.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';

const STORE = '/tmp/fonti.mappaloginstep.test.json';
fs.writeFileSync(STORE, JSON.stringify({ __custom: {} }));
process.env.FONTI_STORE = STORE;
process.env.SUPER_ADMIN_EMAIL = 'test@test.it';
process.env.BREVO_API_KEY = '';

const { _diagnosi } = await import('./fonti.js');
const mappaScraper = _diagnosi.mappaScraper;

const esiti = [];
const prova = (nome, fn) => { try { fn(); esiti.push([true, nome, '']); } catch (e) { esiti.push([false, nome, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };
const risp = (dati) => ({ ok: true, dati });

prova('loggato:true → attiva', () => {
  deve(mappaScraper(risp({ url: 'https://x/area', loggato: true }), true).stato === 'attiva', 'una sessione dichiarata viva non è attiva');
});

prova('loggato:false (configurato) → scaduta', () => {
  deve(mappaScraper(risp({ url: 'https://x/area', loggato: false }), true).stato === 'scaduta', 'un loggato:false esplicito non è scaduta');
});

prova('loggato:null senza login_step → sconosciuto', () => {
  deve(mappaScraper(risp({ url: 'https://x/area', loggato: null }), true).stato === 'sconosciuto', '«non lo so» non resta «non lo so»');
});

prova('loggato:null MA login_step:loggato (Groupama) → attiva', () => {
  const s = mappaScraper(risp({ url: 'https://x/area', loggato: null, login_step: 'loggato', login_running: false }), true).stato;
  deve(s === 'attiva', 'il pallino resta grigio su una sessione che lo scraper dichiara loggata: ' + s);
});

prova('loggato:null + login_step:loggato ma login IN CORSO → non ancora attiva', () => {
  const s = mappaScraper(risp({ url: 'https://x/area', loggato: null, login_step: 'loggato', login_running: true }), true).stato;
  deve(s === 'sconosciuto', 'un login ancora in corso viene già dato per attivo: ' + s);
});

prova('loggato:null + login_step:non_loggato → sconosciuto (non attiva)', () => {
  const s = mappaScraper(risp({ url: 'https://x/area', loggato: null, login_step: 'non_loggato' }), true).stato;
  deve(s === 'sconosciuto', 'uno step non-loggato viene scambiato per attivo: ' + s);
});

prova('loggato:false + login_step:loggato → resta scaduta (il no esplicito vince)', () => {
  const s = mappaScraper(risp({ url: 'https://x/area', loggato: false, login_step: 'loggato' }), true).stato;
  deve(s === 'scaduta', 'un loggato:false esplicito viene sovrascritto da un vecchio step: ' + s);
});

let ko = 0;
console.log('\nMAPPA SCRAPER — il pallino segue anche login_step');
for (const [ok, nome, msg] of esiti) { console.log(ok ? '  ok  ' + nome : '  X   ' + nome + '\n      ' + msg); if (!ok) ko++; }
console.log(`\nMAPPA LOGIN_STEP: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
