// ═══════════════════════════════════════════════════════════════════════════════
//  IL PONTE DALLA PARTE DI IAM — la Edge Function «quoto»
//
//  Perché questa prova esiste.
//
//  Il 20/08/2026 una revisione avversariale ha trovato che i due lati del ponte
//  decidevano la stessa cosa con due regole diverse. Dalla parte di IAM erano
//  due buchi in fila:
//    · «/Fonti» con la maiuscola saltava il controllo del ruolo, perché
//      startsWith è sensibile alle maiuscole mentre il router di QUOTO — allora
//      — non lo era: un utente IAM qualunque arrivava al Pannello Fonti;
//    · «/fonti/x/credenziali/» con la barra finale non veniva riconosciuto come
//      scrittura, quindi la funzione non aggiungeva X-Operatore: la password di
//      un portale si cambiava senza lasciare un nome.
//  Le due cose insieme facevano una sola frase: un collaboratore poteva
//  riscrivere le credenziali di una compagnia, e nel registro non restava
//  scritto chi.
//
//  La Edge Function gira su Deno e qui non c'è. Quindi si fa così: le due
//  funzioni pure si ritagliano dal sorgente VERO e si eseguono (Node sa
//  togliere le annotazioni di tipo da solo); il resto — quali variabili usano i
//  cancelli — si guarda nel file. Guardare il file è più debole che eseguirlo,
//  ma qui il difetto ERA esattamente «il cancello guarda la variabile
//  sbagliata», quindi è la cosa giusta da sorvegliare.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const RADICE = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const SORGENTE = path.join(RADICE, 'supabase/functions/quoto/index.ts');
const src = fs.readFileSync(SORGENTE, 'utf8');

const esiti = [];
const prova = (nome, fn) => esiti.push({ nome, fn });
const deve = (c, msg) => { if (!c) throw new Error(msg); };

/* Ritaglia una funzione dal sorgente vero, dalla riga «function nome» fino alla
   graffa che la chiude. Niente copie: se il sorgente cambia, cambia la prova. */
function ritaglia(nome) {
  const i = src.indexOf('function ' + nome + '(');
  deve(i >= 0, 'la funzione ' + nome + ' non c\'è più nella Edge Function');
  let livello = 0, dentro = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { livello++; dentro = true; }
    else if (src[j] === '}') { livello--; if (dentro && livello === 0) return src.slice(i, j + 1); }
  }
  throw new Error('non riesco a ritagliare ' + nome);
}

const dove = fs.mkdtempSync(path.join(os.tmpdir(), 'ponte-iam-'));
const file = path.join(dove, 'pure.ts');
fs.writeFileSync(file, ritaglia('normalizza') + '\n' + ritaglia('eScrittura') +
  '\nexport { normalizza, eScrittura };\n');
const { normalizza, eScrittura } = await import(file);

// ── 1. Le forme storte non devono cambiare la decisione ──────────────────────
const SCRITTURE = [
  ['POST', '/fonti'],
  ['PUT', '/fonti/allianz'],
  ['DELETE', '/fonti/allianz'],
  ['POST', '/fonti/allianz/credenziali'],
  ['DELETE', '/fonti/allianz/credenziali'],
];

prova('le rotte che toccano le credenziali sono riconosciute come scritture', () => {
  for (const [m, p] of SCRITTURE) {
    deve(eScrittura(m, normalizza(p)), m + ' ' + p + ' non risulta una scrittura');
  }
});

prova('una barra finale non fa sparire la scrittura', () => {
  /* Questo è il difetto vero: con la barra la funzione non aggiungeva
     X-Operatore, e la password si cambiava in anonimo. */
  for (const [m, p] of SCRITTURE) {
    for (const storta of [p + '/', p + '//', p + '///']) {
      deve(eScrittura(m, normalizza(storta)),
        m + ' ' + storta + ' non risulta una scrittura: passerebbe senza X-Operatore');
    }
  }
});

prova('le maiuscole non fanno sparire la scrittura', () => {
  for (const [m, p] of SCRITTURE) {
    for (const storta of [p.toUpperCase(), p.replace(/\/([a-z])/g, (x, c) => '/' + c.toUpperCase())]) {
      deve(eScrittura(m, normalizza(storta)),
        m + ' ' + storta + ' non risulta una scrittura');
    }
  }
  deve(eScrittura('post', normalizza('/fonti/allianz/credenziali')),
    'un metodo in minuscolo fa sparire la scrittura');
});

prova('quello che scrittura non è, non lo diventa', () => {
  /* Il cancello non deve nemmeno essere troppo largo: se «accedi» diventasse
     una scrittura, la vigilanza automatica — che un operatore non ce l'ha —
     non potrebbe più rientrare di notte. */
  for (const [m, p] of [
    ['POST', '/fonti/allianz/accedi'],
    ['POST', '/fonti/allianz/codice'],
    ['POST', '/fonti/allianz/altro-codice'],
    ['POST', '/fonti/allianz/verifica'],
    ['POST', '/fonti/vigilanza/giro'],
    ['GET', '/fonti'],
    ['GET', '/fonti/allianz'],
    ['GET', '/fonti/salute'],
    ['POST', '/quote/casa'],
    ['GET', '/products'],
  ]) {
    deve(!eScrittura(m, normalizza(p)), m + ' ' + p + ' è stato preso per una scrittura: bloccherebbe la vigilanza');
  }
});

prova('normalizza non mangia la radice', () => {
  deve(normalizza('/') === '/', 'la radice è diventata «' + normalizza('/') + '»');
  deve(normalizza('') === '', 'il vuoto è diventato «' + normalizza('') + '»');
  deve(normalizza('/Fonti/') === '/fonti', 'normalizza dà «' + normalizza('/Fonti/') + '»');
});

// ── 2. I cancelli guardano la forma normalizzata, non quella grezza ──────────
prova('il controllo del ruolo guarda la forma normalizzata', () => {
  /* Con startsWith sulla forma grezza, «/Fonti» saltava il controllo e un
     collaboratore qualunque entrava nel Pannello Fonti. */
  const riga = src.split('\n').find(r => /startsWith\(["']\/fonti["']\)/.test(r) && /top_master/.test(r));
  deve(riga, 'non trovo più il controllo del ruolo sul Pannello Fonti');
  deve(/\bpn\.startsWith/.test(riga),
    'il controllo del ruolo guarda il percorso grezzo: «/Fonti» con la maiuscola lo salterebbe — ' + riga.trim().slice(0, 90));
});

prova('X-Operatore si decide sulla forma normalizzata', () => {
  const riga = src.split('\n').find(r => /if \(eScrittura\(/.test(r));
  deve(riga, 'non trovo più la decisione su X-Operatore');
  deve(/eScrittura\(req\.method, pn\)/.test(riga),
    'decide sul percorso grezzo: una barra finale farebbe sparire la firma — ' + riga.trim().slice(0, 90));
});

prova('X-Operatore lo scrive la funzione, non il browser', () => {
  /* Se lo prendesse dall'intestazione in arrivo sarebbe una firma che chiunque
     può falsificare, e il registro di chi ha cambiato una password varrebbe
     zero. */
  const i = src.indexOf('intestazioni["X-Operatore"]');
  deve(i > 0, 'non trovo più il punto in cui X-Operatore viene scritto');
  const attorno = src.slice(i, i + 200);
  deve(/utente\.id/.test(attorno) && /utente\.email/.test(attorno),
    'X-Operatore non viene più dal token verificato: ' + attorno.slice(0, 90));
  deve(!/headers\.get\(["']x-operatore["']\)/i.test(src),
    'la funzione legge X-Operatore da chi la chiama: è una firma falsificabile');
});

// ── 3. Il semaforo non regala niente a chi non è nessuno ─────────────────────
prova('senza una persona dietro, il semaforo dice solo sì o no', () => {
  /* La chiave anon di IAM è pubblica: sta in config.js. Tutto ciò che questa
     rotta racconta a chi non è un utente vero è materiale regalato — quante
     fonti abbiamo, quanto costa una polizza, l'impronta della chiave. */
  const i = src.indexOf('if (pn === "/_ponte")');
  deve(i > 0, 'la rotta del semaforo non c\'è più, o non guarda la forma normalizzata');
  const blocco = src.slice(i, i + 4000);
  const fine = blocco.indexOf('let imp');
  deve(fine > 0, 'la parte per gli estranei e quella completa non si distinguono più');
  /* I commenti si tolgono: parlano dell'impronta e dei prezzi proprio per
     spiegare perché NON devono uscire, e una prova che leggesse anche quelli
     si accuserebbe da sola. */
  const chiusura = blocco.slice(0, fine).replace(/\/\*[\s\S]*?\*\//g, '');
  deve(/if \(!attivo\)/.test(chiusura), 'il semaforo non distingue più chi ha una sessione da chi non ce l\'ha');
  deve(/success: true, pronto:/.test(chiusura), 'la risposta per gli estranei non è più il solo sì/no');
  for (const campo of ['impronta', 'prodotti:', 'premio_annuo', 'quante', 'risposta_quoto']) {
    deve(!chiusura.includes(campo), 'la risposta per gli estranei contiene «' + campo + '»');
  }
});

prova('la prova profonda è riservata a chi il Pannello Fonti lo vede già', () => {
  const i = src.indexOf('url.searchParams.get("prova")');
  deve(i > 0, 'la prova profonda non c\'è più');
  const attorno = src.slice(i - 200, i + 300);
  deve(/top_master/.test(attorno),
    'chiunque abbia una sessione può far fare a QUOTO una quotazione vera e leggere l\'elenco fonti');
});

prova('il percorso che si INOLTRA resta quello vero', () => {
  /* Normalizzare per decidere è giusto; inoltrare il percorso normalizzato no:
     un identificativo di fonte non è detto sia minuscolo, e ci si ritroverebbe
     a chiedere a QUOTO una fonte che non esiste. */
  const riga = src.split('\n').find(r => /QUOTO \+ ["']\/api\/v1["'] \+/.test(r));
  deve(riga, 'non trovo più la riga che inoltra a QUOTO');
  deve(/\+ p \+/.test(riga), 'inoltra il percorso normalizzato invece dell\'originale: ' + riga.trim().slice(0, 90));
});

// ── esecuzione ───────────────────────────────────────────────────────────────
let ko = 0;
console.log('\nPONTE IAM — la Edge Function');
for (const { nome, fn } of esiti) {
  try { await fn(); console.log('  ok  ' + nome); }
  catch (e) { ko++; console.log('  X   ' + nome + '\n      ' + e.message); }
}
console.log(`\nPONTE IAM: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
