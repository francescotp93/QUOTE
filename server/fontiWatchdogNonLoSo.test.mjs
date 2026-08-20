// ═══════════════════════════════════════════════════════════════════════════════
//  «NON LO SO» NON È «STA BENE» — il guardiano e le fonti che non dichiarano
//
//  Il 24H non dice se la sessione è viva: lo si deduce dall'indirizzo su cui sta
//  il browser. Quel ripiego però valeva per TUTTE le fonti, ed era un guaio in
//  agguato: una qualunque che non dichiarasse `loggato` finiva a chiedersi se
//  l'indirizzo fosse quello di login del 24H — che ovviamente non è, perché è
//  un'altra compagnia — e risultava SANA senza che nessuno avesse verificato
//  niente.
//
//  Fino al 20/08/2026 non si vedeva, perché tutte dichiaravano. Poi uno scraper
//  è andato muto su /status e la cosa è saltata fuori: sarebbe diventata una
//  fonte «verde» sulla quale i preventivi fallivano, cioè il guasto peggiore —
//  quello che il pannello ti dice che non c'è.
//
//  Qui si guarda la sola cosa che conta: cosa decide il guardiano quando una
//  fonte NON dichiara la sessione.
// ═══════════════════════════════════════════════════════════════════════════════
import http from 'http';
import fs from 'fs';

const STORE = '/tmp/fonti.nonloso.test.json';
const MEMORIA = '/tmp/fonti.nonloso.memoria.json';
fs.writeFileSync(STORE, JSON.stringify({
  __custom: { assieasy: { nome: 'Assieasy', username: 'utente', attiva: true } },
}));
try { fs.unlinkSync(MEMORIA); } catch {}
process.env.FONTI_STORE = STORE;
process.env.FONTI_VIGILANZA_STORE = MEMORIA;
process.env.SUPER_ADMIN_EMAIL = 'test@test.it';
process.env.BREVO_API_KEY = '';
process.env.FONTI_AUTOLOGIN = '';

const PORTA_ASSIEASY = 4931, PORTA_24H = 4932;
process.env.ASSIEASY_SCRAPER_URL = 'http://127.0.0.1:' + PORTA_ASSIEASY;
process.env.MOTO_SCRAPER_URL = 'http://127.0.0.1:' + PORTA_24H;

/* Due scraper finti che si possono far parlare a comando. */
const risposte = {
  [PORTA_ASSIEASY]: { url: 'https://www.assieasy.it/area', ha_credenziali: true },  // NON dichiara «loggato»
  [PORTA_24H]: { url: 'https://www.24hassistance.com/area', ha_credenziali: true }, // idem, ma è il 24H
};
const servitori = [];
for (const p of [PORTA_ASSIEASY, PORTA_24H]) {
  servitori.push(await new Promise(r => {
    const s = http.createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(risposte[p]));
    });
    s.listen(p, '127.0.0.1', () => r(s));
  }));
}

const { giroDiControllo } = await import('./fontiWatchdog.js');

const esiti = [];
const prova = (nome, fn) => esiti.push({ nome, fn });
const deve = (c, m) => { if (!c) throw new Error(m); };

/* COME SI GUARDA IL VERDETTO, e perché non come sembrerebbe naturale.
   La prima versione di questa prova leggeva `esito.sane` e `esito.cadute`.
   Non esistono: il giro restituisce `caduti` e `rientrati`, e di «sane» non
   c'è traccia. Le quattro prove erano quindi verdi per costruzione — leggevano
   sempre una lista vuota — cioè esattamente il tipo di verde che non guarda
   niente, ed è la seconda volta oggi.
   Il verdetto vero è la memoria che il guardiano SALVA su disco: `salute` vale
   'ok' o 'ko' per ogni fonte, ed è quello che il pannello mostra. */
function salute(id) {
  const m = JSON.parse(fs.readFileSync(MEMORIA, 'utf8'));
  deve(m[id], 'il guardiano non ha nemmeno guardato «' + id + '»: ' + Object.keys(m).join(', '));
  return m[id].salute;
}

async function giro() { return giroDiControllo({ conRientro: false }); }

prova('una fonte che NON dichiara la sessione non passa per sana', async () => {
  /* Prima della correzione questa riga passava: assieasy non dichiarava, il
     ripiego del 24H diceva «l'indirizzo non è quello di login del 24H, quindi
     è dentro», e il guardiano se ne andava contento. */
  delete risposte[PORTA_ASSIEASY].loggato;
  await giro();
  deve(salute('assieasy') === 'ko',
    'assieasy risulta «' + salute('assieasy') + '» pur non avendo mai detto di essere dentro');
});

prova('e se invece la dichiara, si crede a lei', async () => {
  risposte[PORTA_ASSIEASY].loggato = true;
  await giro();
  deve(salute('assieasy') === 'ok',
    'ha dichiarato di essere dentro e risulta «' + salute('assieasy') + '»');
});

prova('il ripiego dell\'indirizzo resta al 24H, che è l\'unico che ne ha bisogno', async () => {
  /* Non è un dettaglio: senza questo ripiego il 24H risulterebbe caduto per
     sempre, perché quello scraper non dichiara la sessione e non lo farà. */
  delete risposte[PORTA_24H].loggato;
  risposte[PORTA_24H].url = 'https://www.24hassistance.com/area-riservata';
  await giro();
  deve(salute('24h') === 'ok',
    'il 24H risulta «' + salute('24h') + '» pur essendo su una pagina interna');
});

prova('e per il 24H la pagina di login vuol dire davvero «fuori»', async () => {
  risposte[PORTA_24H].url = 'https://login.24hassistance.com/';
  await giro();
  deve(salute('24h') === 'ko',
    'il 24H e\' sulla pagina di login e risulta «' + salute('24h') + '»');
});

let ko = 0;
console.log('\nGUARDIANO — «non lo so» non è «sta bene»');
for (const { nome, fn } of esiti) {
  try { await fn(); console.log('  ok  ' + nome); }
  catch (e) { ko++; console.log('  X   ' + nome + '\n      ' + e.message); }
}
for (const s of servitori) s.close();
console.log(`\nGUARDIANO NON LO SO: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
