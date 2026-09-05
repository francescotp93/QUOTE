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

prova('il report dice da quale decreto esce il coefficiente', () => {
  /* «Tabella INPS, biennio 2025-2026» era sbagliato due volte: la tabella la
     pubblica un decreto ministeriale, e l'etichetta del periodo adesso arriva
     dalla scadenza in tabella. Un documento riaperto fra due anni senza la
     fonte non è ricostruibile. */
  const tab = { biennio: 'in vigore fino al 31/12/2026', daVerificare: false, perEta: { 67: 0.05608 },
    fonte: 'Decreto direttoriale 20 novembre 2024', avvisi: [] };
  const pr = P.prospettivaPensionistica({ eta: 40, etaPensionamento: 67, redditoAnnuo: 30000,
    anniContributiGia: 15, annoRiferimento: 2026, coefficienti: tab });
  deve(pr.coefficienti.fonte === tab.fonte, 'la fonte non entra nello snapshot del risultato');
  const r = P.reportPrevidenza({ prospettiva: pr, valutazione: P.valutaSoluzione(pr, 150),
    cliente: { nome: 'Prova' }, consulente: { nome: 'F. Oddo', ruolo: 'Intermediario', rui: 'X', email: 'a@b.it', telefono: '1' },
    dataRiferimento: '3 settembre 2026' });
  deve(/Decreto direttoriale 20 novembre 2024/.test(r.html), 'il report non cita il decreto');
  deve(!/Tabella INPS/.test(r.html), 'il report chiama ancora «Tabella INPS» un decreto ministeriale');
  return 'il decreto è scritto sul foglio';
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

prova('se il server non risponde il modulo si ferma, non ripiega', () => {
  /* CAMBIATA IL 05/09/2026. Prima questa prova pretendeva che, non riuscendo a
     leggere la tabella, il modulo calcolasse con la copia di riserva e lo
     dicesse con un avviso. Era il compromesso sbagliato: la copia di riserva
     non ha la serie Eurostat né i requisiti proiettati, quindi il coefficiente
     resta fermo e la pensione esce PIU' ALTA del vero — e un avviso sopra un
     numero sbagliato non protegge nessuno. Adesso il calcolo si ferma.
     IL CASO CHE DEVE FALLIRE: se qualcuno rimettesse il ripiego sui
     COEFFICIENTI del motore, le due righe qui sotto lo prendono. */
  const f = src.slice(src.indexOf('async function caricaNumeriPrevidenza'), src.indexOf('function prevAvvisi'));
  const catch_ = f.slice(f.indexOf('} catch'));
  deve(/avvisiParametri = \[/.test(catch_), 'in caso di errore non scrive nessun avviso');
  deve(/parametri = 'ko'/.test(catch_), 'l\'errore non viene registrato: il calcolo partirebbe lo stesso');
  deve(/coefficienti = null/.test(catch_), 'i coefficienti vecchi restano in memoria e il conto si farebbe con quelli');
  deve(!/COEFFICIENTI, \{ avvisi/.test(catch_), 'e\' tornato il ripiego sulla copia di riserva del motore');
  /* E il blocco deve arrivare fino al tasto: nel calcolo. */
  const calc = src.slice(src.indexOf('async function prevCalcola'), src.indexOf('function prevIpotesi'));
  deve(/parametri !== 'ok'/.test(calc), 'il calcolo non controlla di avere i numeri di legge');
  deve(/Parametri non disponibili/.test(calc), 'non c\'e\' il messaggio deciso: «Parametri non disponibili, riprova»');
  return 'niente numeri senza tabella, e il perche\' scritto';
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

/* ── 3) I guasti della mappa del 03/09/2026 ──────────────────────────────── */

prova('lo step delle ipotesi non scrive virgole dentro un campo numerico', () => {
  /* Il campo mostrava «3,50» dentro un <input type="number">: non è un valore
     valido, e il browser lo disegna VUOTO senza dire niente. Erano vuoti
     esattamente i dieci parametri in percentuale — cioè tutti i modificabili —
     e la pagina che esiste per rendere verificabile il conto era l'unica a non
     mostrare nulla. */
  const f = src.slice(src.indexOf('function prevIpotesi'), src.indexOf('function prevCorreggi'));
  deve(!/prev-ip-.{0,30}type="number"/.test(f), 'il campo delle ipotesi è tornato numerico: con la virgola si svuota');
  deve(/prev-ip-.{0,30}type="text"/.test(f), 'il campo delle ipotesi non è di testo');
  deve(/inputmode="decimal"/.test(f), 'il campo non dichiara che ci si scrivono numeri');
  const c = src.slice(src.indexOf('function prevCorreggi'), src.indexOf('function prevFormReport'));
  deve(/replace\(',', *'\.'\)/.test(c), 'chi scrive «3,5» invece di «3.5» non viene capito');
});

prova('le linguette dei passi si possono premere', () => {
  // Sembravano premibili e non lo erano: il caso peggiore.
  const f = src.slice(src.indexOf('function prevVai'), src.indexOf('function prevCampi'));
  deve(/onclick="prevVai\(/.test(f), 'le linguette non portano da nessuna parte');
  deve(/disabled/.test(f), 'quelle non ancora raggiungibili sembrano premibili lo stesso');
});

prova('i pulsanti del modulo hanno uno stile', () => {
  /* btn-primary e btn-ghost erano nel markup da sempre e non esistevano nel
     foglio di stile: tutto il modulo usciva coi pulsanti grigi del browser. */
  for (const c of ['btn-primary', 'btn-ghost']) {
    deve(new RegExp('\\.' + c + '\\{').test(src), 'la classe ' + c + ' non è definita nel foglio di stile');
  }
});

prova('lo step 2 chiede il regime contributivo', () => {
  /* Il motore ha due aliquote — 33% e 24% — e nessuno gli diceva quale:
     prendeva quella del dipendente per tutti. Sui profili autonomi la pensione
     pubblica usciva sbagliata in partenza. */
  const m = src.match(/var PREV_CAMPI = \{[\s\S]*?\n\};/);
  deve(m, 'manca PREV_CAMPI');
  deve(/k: 'gestione'/.test(m[0]), 'non si chiede mai il regime contributivo');
  deve(/esposta/.test(m[0]), 'le opzioni non vengono filtrate su quelle esposte');
  const conGestione = (g) => P.prospettivaPensionistica({ eta: 33, etaPensionamento: 67,
    redditoAnnuo: 24000, anniContributiGia: 9, annoRiferimento: 2026, gestione: g }).pensioneAnnua;
  deve(conGestione('artigiani') < conGestione('dipendenti_privati'),
    'la risposta non cambia niente: l\'aliquota della gestione non viene applicata');
  deve(conGestione('gs_professionisti') !== conGestione('gs_collaboratori'),
    'professionista e collaboratore danno la stessa pensione: le due gestioni non sono distinte');
});

prova('il coefficiente di trasformazione si vede fra le ipotesi', () => {
  // È il numero più decisivo del calcolo, ed era l'unico invisibile.
  const f = src.slice(src.indexOf('function prevIpotesi'), src.indexOf('function prevCorreggi'));
  deve(/Coefficiente di trasformazione/.test(f), 'il coefficiente non compare nello step delle ipotesi');
  deve(/di legge/.test(f), 'non è marcato come numero di legge: sembrerebbe correggibile a mano');
});

prova('l\'avviso dice PERCHE\' non ha letto i parametri', () => {
  /* Con un avviso unico per rete caduta, rotta cambiata, tabella vuota e token
     scaduto, chi lo legge non sa dove guardare e può solo riprovare. */
  const f = src.slice(src.indexOf('async function caricaNumeriPrevidenza'), src.indexOf('function prevAvvisi'));
  deve(/AbortError/.test(f), 'un server che non risponde e uno che risponde male danno lo stesso avviso');
  deve(/perche/i.test(f), 'il motivo non finisce nell\'avviso');
});

prova('il testo che legge il cliente ha gli accenti', () => {
  /* Su un documento che l'intermediario consegna e firma, «perche'» e «piu'»
     sono un problema di immagine. Si guardano le stringhe del motore, non i
     commenti: nei commenti la scrittura senza accenti resta quella di casa. */
  const mot = fs.readFileSync(path.join(RADICE, 'tariffe/motore/previdenza.js'), 'utf8');
  const stringhe = mot.match(/'(?:[^'\\]|\\.)*'/g) || [];
  const storte = stringhe.filter(t => /(perche|piu|cioe|gia|eta|puo)\\'/.test(t));
  deve(storte.length === 0, 'testi senza accento: ' + storte.slice(0, 3).join(' | '));
  deve(!/valore che usava il Lab/.test(mot), 'una nota di sviluppo è ancora visibile al cliente');
  return stringhe.length + ' stringhe controllate';
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
