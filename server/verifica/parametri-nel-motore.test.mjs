// ═══════════════════════════════════════════════════════════════════════════════
//  I NUMERI DI LEGGE ARRIVANO DAVVERO FINO AL CALCOLO
//
//  Perché questa prova esiste. Il 03/09/2026 la schermata «Analisi previdenziale»
//  (quella dentro Vita, con il report che si consegna al cliente) calcolava con i
//  coefficienti di trasformazione del biennio PRECEDENTE: più alti dell'1,8% su
//  ogni età. Nel motore c'era scritto `daVerificare: true` con la nota «vanno
//  confermati prima di usarli in un documento consegnato al cliente», e quella
//  bandiera non l'aveva tolta nessuno. Il conto non dava nessun errore: dava una
//  pensione plausibile e gonfiata.
//
//  Cosa sorveglia. Che la catena regga da un capo all'altro: tabella dei
//  parametri → server → schermata → motore → report. Ogni anello ha un modo
//  silenzioso di rompersi, e sono tutti qui sotto.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const RADICE = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const src = fs.readFileSync(path.join(RADICE, 'index.html'), 'utf8');
const require = createRequire(import.meta.url);
let P = null;
try { P = require(path.join(RADICE, 'tariffe/motore/previdenza.js')); } catch (e) { P = null; }

const esiti = [];
const prova = (nome, fn) => esiti.push({ nome, fn });
const deve = (c, msg) => { if (!c) throw new Error(msg); };

/* ── 1) Il motore ────────────────────────────────────────────────────────── */

prova('il motore ha i coefficienti del decreto, non quelli del biennio prima', () => {
  deve(P, 'il motore non si carica');
  const attesi = { 62: 0.04795, 65: 0.05250, 67: 0.05608, 70: 0.06258 };
  for (const eta of Object.keys(attesi)) {
    const v = P.coefficientePerEta(Number(eta));
    deve(v === attesi[eta], 'a ' + eta + ' anni il coefficiente è ' + v + ', il decreto dice ' + attesi[eta]);
  }
  deve(P.COEFFICIENTI.daVerificare === false, 'la tabella si dichiara ancora da verificare');
  deve(/decreto/i.test(P.COEFFICIENTI.fonte || ''), 'la tabella non dice da quale decreto viene');
  return 'decreto 20/11/2024, quattro età controllate';
});

prova('c\'è una porta per l\'archivio, ed è diversa da quella del consulente', () => {
  /* Due porte, due mestieri. `ipotesiAttive` è il consulente e sui numeri di
     legge deve restare senza voce; `numeriDiLegge` è l'archivio ufficiale.
     Se un giorno si confondessero, un report potrebbe uscire con un tetto di
     deducibilità scelto a mano da chi lo firma. */
  deve(typeof P.numeriDiLegge === 'function', 'manca numeriDiLegge()');
  const prima = P.IPOTESI.dedMax.v;
  deve(P.ipotesiAttive({ dedMax: 9999 }).dedMax.v === prima, 'una correzione a mano cambia un numero di legge');
  P.numeriDiLegge({ tetto_deducibilita: 5300 });
  deve(P.IPOTESI.dedMax.v === 5300, 'l\'archivio non riesce a scrivere il tetto');
  P.numeriDiLegge({ tetto_deducibilita: prima });
  return 'l\'archivio scrive, chi firma no';
});

prova('gli avvisi della tabella arrivano fino al report', () => {
  const tab = { biennio: '2025-2026', daVerificare: false, perEta: { 67: 0.05608 },
    avvisi: ['«coefficienti_trasformazione» è scaduto il 2026-12-31.'] };
  const p = P.prospettivaPensionistica({ eta: 40, etaPensionamento: 67, redditoAnnuo: 30000,
    anniContributiGia: 15, annoRiferimento: 2026, coefficienti: tab });
  deve(p.avvisi.some(a => /scaduto/.test(a)), 'l\'avviso della tabella si perde nel risultato');
  return 'l\'avviso non si ferma per strada';
});

/* ── 2) La schermata ─────────────────────────────────────────────────────── */

prova('la schermata va a prendere i numeri dal server, non da Supabase', () => {
  /* La tabella è riservata allo staff (iam_is_staff), ma l'analisi la fa anche
     il collaboratore della rete al suo cliente: leggendola col client del
     browser lui riceverebbe zero righe e nessun errore — cioè il calcolo con
     la copia di riserva, in silenzio. */
  deve(/caricaNumeriPrevidenza/.test(src), 'manca la funzione che carica i numeri');
  const f = src.slice(src.indexOf('async function caricaNumeriPrevidenza'), src.indexOf('function prevAvvisi'));
  deve(/parametri-previdenziali\/numeri/.test(f), 'non chiama la rotta dei parametri');
  deve(!/db\.from\(/.test(f), 'legge la tabella col client del browser: il collaboratore riceverebbe zero righe in silenzio');
  deve(/numeriDiLegge/.test(f), 'non passa i numeri al motore');
  return 'passa dal server, e li mette dentro al motore';
});

prova('i coefficienti letti finiscono DENTRO i dati del calcolo', () => {
  // Leggerli e non passarli è il modo più silenzioso di sbagliare: la schermata
  // mostrerebbe i numeri nuovi e calcolerebbe con quelli vecchi.
  const f = src.slice(src.indexOf('function prevLeggi'), src.indexOf('function prevBox'));
  deve(/d\.coefficienti = PREV\.coefficienti/.test(f), 'prevLeggi non passa i coefficienti al motore');
  return 'prevLeggi li mette nei dati';
});

prova('se il server non risponde lo dice, e non tace', () => {
  const f = src.slice(src.indexOf('async function caricaNumeriPrevidenza'), src.indexOf('function prevAvvisi'));
  const catch_ = f.slice(f.indexOf('} catch'));
  deve(/avvisiParametri = \[/.test(catch_), 'in caso di errore non scrive nessun avviso');
  deve(/copia di riserva/.test(catch_), 'l\'avviso non dice con che numeri sta calcolando');
  /* L'avviso va ATTACCATO alla tabella, non solo mostrato: sullo schermo lo si
     legge e si dimentica, sul report resta scritto. */
  deve(/COEFFICIENTI, \{ avvisi/.test(catch_), 'l\'avviso non viaggia col calcolo fino al report');
  return 'lo dice sullo schermo e sul foglio';
});

prova('una risposta senza i numeri non passa per buona', () => {
  /* Un server che risponde 200 con un corpo vuoto — una rotta cambiata, un
     proxy di mezzo, la tabella svuotata — passerebbe in silenzio: si
     continuerebbe con la copia di riserva credendo di avere i numeri di oggi.
     E' il guasto più insidioso, perché non somiglia a un guasto. */
  const f = src.slice(src.indexOf('async function caricaNumeriPrevidenza'), src.indexOf('function prevAvvisi'));
  deve(/perEta/.test(f), 'non controlla che la risposta porti davvero i coefficienti');
  deve(/throw new Error/.test(f), 'una risposta inutile non viene trattata come una mancata risposta');
  return 'risposta vuota = nessuna risposta';
});

prova('la richiesta ha un tempo massimo, non solo un catch', () => {
  /* Una richiesta che FALLISCE si gestisce con un catch. Una che resta APPESA
     no: senza scadenza la schermata resta muta per sempre, il consulente
     calcola con la copia di riserva e nessuno glielo dice. È il caso peggiore,
     ed è anche il primo che capita quando il server è sotto sforzo. */
  const f = src.slice(src.indexOf('async function caricaNumeriPrevidenza'), src.indexOf('function prevAvvisi'));
  deve(/AbortController/.test(f), 'la richiesta non ha un tempo massimo: se il server resta appeso, la schermata tace per sempre');
  deve(/signal:/.test(f), 'la scadenza c\'è ma non è collegata alla richiesta');
  deve(/clearTimeout/.test(f), 'il timer non viene spento quando la risposta arriva');
  return 'oltre il tempo massimo si passa dall\'avviso';
});

prova('la schermata si raggiunge dal menu, non solo da Vita', () => {
  // Era il motivo per cui non la trovava nessuno.
  deve(/id="nav-analprev"[^>]*onclick="apriPrevidenza\(\)"/.test(src), 'manca la voce di menu');
  deve(/nav-analprev'\);[\s\S]{0,80}style\.display='flex'/.test(src), 'la voce di menu non viene mai mostrata');
  return 'voce nel menu, accanto ai Parametri';
});

prova('arrivando dalla scocca IAM la schermata si apre avviata, non a metà', () => {
  const m = src.match(/const PAGINE_DA_AVVIARE = \{[\s\S]*?\n\};/);
  deve(m, 'manca PAGINE_DA_AVVIARE');
  deve(/previdenza:\s*\(\) => apriPrevidenza\(\)/.test(m[0]), 'previdenza non ha la sua porta: da IAM si aprirebbe sul passo di prima');
  return 'porta registrata';
});

/* ── 3) Quello che non deve tornare ──────────────────────────────────────── */

prova('non esiste un secondo motore previdenziale dentro la pagina', () => {
  /* Il conto sta in tariffe/motore/previdenza.js, provato a parte. Una formula
     scritta dentro index.html non si può provare senza aprire un browser, ed è
     il motivo per cui quella del Lab non era mai stata verificata. */
  const da = src.indexOf('function prevCalcola');
  const a = src.indexOf('function prevReport');
  const blocco = src.slice(da, a > da ? a : da + 8000);
  deve(!/0\.0560|0\.0525|5164|\* *coefficiente/.test(blocco),
    'nella schermata è comparso un numero di legge o un pezzo di calcolo');
  return 'la schermata raccoglie e mostra, non calcola';
});

/* ── esecuzione ──────────────────────────────────────────────────────────── */
let ok = 0;
for (const e of esiti) {
  try { const m = e.fn(); ok++; console.log('  ok  ' + e.nome + (m ? '  — ' + m : '')); }
  catch (err) { console.log('  KO  ' + e.nome + '  — ' + err.message); }
}
console.log('\nPARAMETRI NEL MOTORE: ' + ok + ' superate, ' + (esiti.length - ok) + ' fallite');
process.exit(ok === esiti.length ? 0 : 1);
