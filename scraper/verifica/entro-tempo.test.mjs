// ═══════════════════════════════════════════════════════════════════════════════
//  /status DEVE RISPONDERE, ANCHE QUANDO NON SA
//
//  Il Pannello Fonti, il guardiano automatico e la diagnosi chiedono a ogni
//  scraper `/status` di continuo. È la domanda «come stai?»: una risposta deve
//  arrivare in pochi secondi sempre, anche quando la risposta è «non lo so».
//
//  Fino al 20/08/2026 cinque scraper rispondevano chiamando `loggedIn()`, che
//  non è una lettura ma una guida del browser: dentro c'è un
//  `page.goto(..., timeout: 45000)`. Col browser occupato, `/status` non
//  rispondeva affatto — e chi chiedeva concludeva quello che gli pareva.
//  Il pannello scriveva «non lo dice»; il guardiano arrivava a dedurre «sta
//  bene». Una fonte verde su cui i preventivi falliscono è il guasto peggiore
//  che ci sia, perché è quello che il pannello ti dice che non c'è.
//
//  Trovato confrontando due letture della VPS a un minuto di distanza: si
//  contraddicevano su assieasy. Non erano cambiate le compagnie, era `/status`
//  che a volte non arrivava in tempo.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { entroTempo } from '../comune/entroTempo.mjs';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = path.dirname(QUI);

const esiti = [];
const prova = (nome, fn) => esiti.push({ nome, fn });
const deve = (c, m) => { if (!c) throw new Error(m); };
const dopo = (ms, v) => new Promise(r => setTimeout(() => r(v), ms));

// ── 1. La scadenza fa il suo mestiere ───────────────────────────────────────
prova('se la risposta arriva in tempo, è quella vera', async () => {
  deve(await entroTempo(() => dopo(20, true), 500, null) === true, 'ha buttato via una risposta buona');
  deve(await entroTempo(() => dopo(20, false), 500, null) === false, 'ha confuso «no» con «non lo so»');
});

prova('se non arriva in tempo, risponde «non lo so» e non aspetta', async () => {
  const t = Date.now();
  const v = await entroTempo(() => dopo(5000, true), 200, null);
  const passati = Date.now() - t;
  deve(v === null, 'ha risposto «' + v + '» invece di «non lo so»');
  deve(passati < 1500, 'ha aspettato ' + passati + 'ms: la scadenza non serve a niente');
});

prova('«non lo so» non diventa «no»', async () => {
  /* È la differenza che conta: «no» manda il guardiano a rifare il login,
     «non lo so» no. Confonderle vuol dire tentativi a vuoto contro il portale
     di una compagnia, che è come ci si fa bloccare l'utenza. */
  deve(await entroTempo(() => dopo(5000, true), 100, null) !== false, 'un ritardo e\' diventato un «no»');
  deve(await entroTempo(() => { throw new Error('browser occupato'); }, 500, null) === null,
    'un errore e\' diventato un «no» invece che «non lo so»');
});

prova('un ripiego diverso da null si può chiedere, se serve', async () => {
  deve(await entroTempo(() => dopo(5000, 'tardi'), 100, 'ripiego') === 'ripiego', 'il ripiego non viene usato');
});

prova('il lavoro lasciato indietro non fa esplodere niente', async () => {
  /* La promessa continua per conto suo: se un suo errore arrivasse dopo la
     scadenza e nessuno lo raccogliesse, il processo dello scraper morirebbe
     per «unhandled rejection» — cioè la compagnia si spegnerebbe davvero, per
     colpa di una diagnostica. */
  let esploso = null;
  const suQuesto = (e) => { esploso = e; };
  process.once('unhandledRejection', suQuesto);
  await entroTempo(() => new Promise((_, no) => setTimeout(() => no(new Error('arrivato tardi')), 60)), 20, null);
  await dopo(300);
  process.removeListener('unhandledRejection', suQuesto);
  deve(!esploso, 'un errore in ritardo ha fatto saltare il processo: ' + esploso);
});

// ── 2. Gli scraper la usano davvero ─────────────────────────────────────────
const CON_LOGGEDIN = ['assieasy', 'axa', 'groupama', 'kube', 'prima'];

prova('nessuno scraper chiede al browser dentro /status senza una scadenza', () => {
  /* La prova guarda il file: è più debole che eseguirlo, ma lo scraper vero non
     si può avviare qui (apre un browser e si collega a un portale). E il
     difetto ERA esattamente «questa riga chiama loggedIn() senza scadenza»,
     quindi è la riga giusta da sorvegliare. */
  const colpevoli = [];
  for (const nome of CON_LOGGEDIN) {
    const f = path.join(SCRAPER, nome, 'quote-service.mjs');
    if (!fs.existsSync(f)) { colpevoli.push(nome + ' (file sparito)'); continue; }
    const src = fs.readFileSync(f, 'utf8');
    const i = src.indexOf("startsWith('/status')");
    if (i < 0) { colpevoli.push(nome + ' (non ha piu\' /status)'); continue; }
    const blocco = src.slice(i, i + 900);
    if (/await loggedIn\(\)/.test(blocco) && !/entroTempo\(/.test(blocco)) colpevoli.push(nome);
  }
  deve(colpevoli.length === 0,
    'questi rispondono a /status guidando il browser senza scadenza: ' + colpevoli.join(', ') +
    ' — con browser occupato /status non risponde, e chi chiede conclude quello che gli pare');
});

prova('e chi la usa se la importa davvero', () => {
  for (const nome of CON_LOGGEDIN) {
    const src = fs.readFileSync(path.join(SCRAPER, nome, 'quote-service.mjs'), 'utf8');
    if (!/entroTempo\(/.test(src)) continue;
    deve(/from '\.\.\/comune\/entroTempo\.mjs'/.test(src),
      nome + ' usa entroTempo ma non lo importa: si spegnerebbe all\'avvio');
  }
});

prova('la scadenza è più corta di chi sta aspettando', () => {
  /* Chi interroga rinuncia dopo 8 secondi (fontiSonda) e il guardiano anche
     prima. Una scadenza più lunga di così non servirebbe a niente: la risposta
     arriverebbe quando non la aspetta più nessuno. */
  for (const nome of CON_LOGGEDIN) {
    const src = fs.readFileSync(path.join(SCRAPER, nome, 'quote-service.mjs'), 'utf8');
    const m = src.match(/entroTempo\(\(\) => loggedIn\(\),\s*(\d+)/);
    deve(m, nome + ': non trovo la scadenza su loggedIn()');
    deve(Number(m[1]) <= 6000, nome + ': aspetta ' + m[1] + 'ms, ma chi chiede rinuncia prima');
  }
});

let ko = 0;
console.log('\n/status RISPONDE SEMPRE');
for (const { nome, fn } of esiti) {
  try { await fn(); console.log('  ok  ' + nome); }
  catch (e) { ko++; console.log('  X   ' + nome + '\n      ' + e.message); }
}
console.log(`\nENTRO TEMPO: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
