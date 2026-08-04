// ═══════════════════════════════════════════════════════════════════════════════
//  VIGILANZA FONTI — la stessa cosa non si dice due volte
//
//  Il 02-03/08/2026 la casella di Francesco si e' riempita di avvisi identici.
//  Le cause erano due, e nessuna delle due era «troppi controlli»:
//
//   1. LA MEMORIA VIVEVA IN RAM. Il backend si riavvia a ogni rilascio che tocca
//      server/ — cioe' spesso. Dopo un riavvio una fonte gia' caduta risultava
//      «mai vista»: il rientro veniva annunciato senza che la caduta lo fosse
//      mai stata. Una mail dal nulla, a ogni rilascio.
//   2. NESSUNA CONFERMA. Una fonte che oscilla (cade, rientra, ricade) mandava
//      due mail a ogni giro di controllo.
//
//  Piu' un terzo caso piu' piccolo: finita la quarantena il contatore dei
//  tentativi restava sopra la soglia, quindi il primo fallimento successivo
//  faceva ripartire l'avviso «serve un accesso manuale», e cosi' via.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import os from 'os';

const STORE = path.join(os.tmpdir(), 'vigilanza-prova-' + process.pid + '.json');
process.env.FONTI_VIGILANZA_STORE = STORE;
process.env.FONTI_VIGILANZA_CONFERME = '2';
process.env.FONTI_AUTOLOGIN = '0';

const esiti = [];
const prova = async (nome, fn) => {
  try { const m = await fn(); esiti.push([true, nome, m || '']); }
  catch (e) { esiti.push([false, nome, e.message]); }
};
const deve = (c, msg) => { if (!c) throw new Error(msg); };

/* Il sorgente si legge come testo: qui non si simula una rete, si verifica che
   le tre regole SIANO SCRITTE. Farle scattare davvero richiederebbe un finto
   Pannello Fonti e quattro scraper finti — e la prova diventerebbe piu' fragile
   di quello che sorveglia. */
const src = fs.readFileSync(new URL('./fontiWatchdog.js', import.meta.url), 'utf8');

function corpoDi(firma) {
  const i = src.indexOf(firma);
  if (i < 0) return null;
  /* Il corpo comincia dopo la parentesi CHIUSA dei parametri, non alla prima
     graffa: `giroDiControllo({ conRientro = AUTOLOGIN } = {})` ha le graffe
     nella firma, e partire da li' restituisce i parametri invece del corpo. */
  let p = 0, k = src.indexOf('(', i);
  for (; k < src.length; k++) {
    if (src[k] === '(') p++;
    else if (src[k] === ')') { p--; if (p === 0) break; }
  }
  let liv = 0, j = src.indexOf('{', k);
  const inizio = j;
  for (; j < src.length; j++) {
    if (src[j] === '{') liv++;
    else if (src[j] === '}') { liv--; if (liv === 0) return src.slice(inizio, j + 1); }
  }
  return null;
}

// ── 1. La memoria sopravvive al riavvio ──────────────────────────────────────
await prova('la memoria finisce su disco, non solo in RAM', () => {
  deve(/FONTI_VIGILANZA_STORE/.test(src), 'non c\'è un file dove salvare la memoria');
  deve(/fs\.writeFileSync\(STORE/.test(src), 'la memoria non viene mai scritta');
  deve(/fs\.readFileSync\(STORE/.test(src), 'la memoria non viene mai riletta all\'avvio');
  const f = corpoDi('function salvaMemoria()');
  deve(f && /catch/.test(f), 'un disco pieno farebbe cadere il giro di controllo');
});

await prova('salvare la memoria non può far cadere la vigilanza', async () => {
  /* Se il file non è scrivibile si perde la memoria, non il controllo: una
     vigilanza che si spegne perché non riesce a prendere appunti è peggio di
     una che li perde. */
  const { giroDiControllo } = await import('./fontiWatchdog.js');
  process.env.FONTI_VIGILANZA_STORE = '/percorso/che/non/esiste/x.json';
  let esploso = null;
  try { await giroDiControllo({ conRientro: false }); } catch (e) { esploso = e; }
  process.env.FONTI_VIGILANZA_STORE = STORE;
  deve(!esploso, 'il giro è caduto perché non ha potuto salvare: ' + (esploso && esploso.message));
});

// ── 2. Serve una conferma prima di annunciare ────────────────────────────────
await prova('un cambiamento si annuncia solo dopo conferma', () => {
  deve(/const CONFERME = num\(/.test(src), 'manca la soglia di conferma');
  const g = corpoDi('export async function giroDiControllo(');
  deve(g, 'manca giroDiControllo');
  deve(/m\.conferme >= CONFERME/.test(g), 'la caduta si annuncia al primo controllo storto');
  const occorrenze = (g.match(/m\.conferme >= CONFERME/g) || []).length;
  deve(occorrenze >= 2, 'la conferma vale solo in un verso: ' + occorrenze + ' controlli (attesi 2, caduta e rientro)');
});

// ── 3. Lo stato GIÀ comunicato non si ricomunica ─────────────────────────────
await prova('la stessa cosa non si dice due volte', () => {
  /* `dettoSalute` è lo stato già uscito per posta. Senza, ogni giro in cui la
     fonte è ancora giù ripete lo stesso allarme: è il difetto che ha riempito
     la casella. */
  deve(/dettoSalute/.test(src), 'manca la memoria di che cosa è già stato comunicato');
  const g = corpoDi('export async function giroDiControllo(');
  deve(/m\.dettoSalute !== 'ko'/.test(g), 'la caduta viene annunciata anche se già annunciata');
  deve(/m\.dettoSalute === 'ko'/.test(g), 'il rientro viene annunciato anche di una fonte mai data per caduta');
});

await prova('il rientro non si annuncia se la caduta non era stata detta', () => {
  /* È esattamente la mail dal nulla dopo un riavvio: «tornata operativa» di
     qualcosa che nessuno sapeva fosse caduto. */
  const g = corpoDi('export async function giroDiControllo(');
  const i = g.indexOf("m.dettoSalute === 'ko'");
  deve(i > 0, 'non si controlla che la caduta fosse stata comunicata');
  const attorno = g.slice(i, i + 220);
  deve(/rientrati\.push/.test(attorno), 'il controllo non governa l\'annuncio del rientro');
});

// ── 4. La quarantena avvisa una volta sola ───────────────────────────────────
await prova('«serve un accesso manuale» si dice una volta per quarantena', () => {
  const g = corpoDi('export async function giroDiControllo(');
  deve(/dettaQuarantena/.test(g), 'nessuna memoria dell\'avviso di quarantena già dato');
  const i = g.indexOf('accesso manuale');
  deve(i > 0, 'l\'avviso di quarantena è sparito');
  const prima = g.slice(Math.max(0, i - 260), i);
  deve(/if \(!m\.dettaQuarantena\)/.test(prima), 'l\'avviso non è protetto: si ripete a ogni ciclo di quarantena');
});

// ── 5. Una mail per giro, non due ────────────────────────────────────────────
await prova('cadute e rientri dello stesso momento stanno in una mail sola', () => {
  const g = corpoDi('export async function giroDiControllo(');
  const invii = (g.match(/await avvisa\(/g) || []).length;
  deve(invii === 1, 'manda ' + invii + ' mail per giro invece di 1');
  deve(/caduti\.length \|\| rientrati\.length/.test(g), 'non unisce cadute e rientri');
});

// ── 6. Non si scrive quando non è successo niente ────────────────────────────
await prova('un giro senza novità non manda niente', () => {
  const g = corpoDi('export async function giroDiControllo(');
  const i = g.indexOf('if (caduti.length || rientrati.length)');
  deve(i > 0, 'manca la condizione: manderebbe una mail a ogni giro');
  deve(g.indexOf('await avvisa(') > i, 'l\'invio non è dentro la condizione');
});

try { fs.unlinkSync(STORE); } catch {}
let ko = 0;
console.log('\nVIGILANZA — la stessa cosa non si dice due volte');
for (const [ok, nome, msg] of esiti) {
  console.log(ok ? '  ok  ' + nome + (msg ? ' — ' + msg : '') : '  X   ' + nome + ' — ' + msg);
  if (!ko && !ok) ko++;
  if (!ok) ko = ko || 1;
}
ko = esiti.filter(e => !e[0]).length;
console.log(`\nVIGILANZA SILENZIO: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
