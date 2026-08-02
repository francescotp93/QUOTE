// ═══════════════════════════════════════════════════════════════════════════════
//  ALLIANZ — utente, poi codice monouso. Nessuna password.
//
//  Come si è arrivati qui, il 02/08/2026, guardando il portale vero e non il
//  codice. Le due schermate hanno gli stessi identici 13 campi: un solo input
//  visibile (#nffc, type=text) e un pulsante #loginButton2. Nessun campo
//  type=password compare mai, nemmeno aspettando altri otto secondi. Il testo
//  della seconda pagina dice:
//
//      Codice di autenticazione monouso (TOTP)
//      Ottieni TOTP generato da dispositivo
//      Avanti  Annulla
//      Login non riuscito. Riprovare.
//
//  Quindi il flusso è: codice utente → codice monouso. Il codice invece si
//  aspettava utente → password → 2FA, e si fermava con «campo password NON
//  comparso»: il TOTP, che era già nel Pannello Fonti insieme al suo
//  generatore, non veniva mai inserito.
//
//  Due ipotesi sbagliate sono cadute per strada, e le prove qui sotto esistono
//  perché non tornino: «Allianz ha aggiunto una schermata password» (falso: di
//  password non ce n'è più) e «il campo viene riusato per la password» (falso:
//  è il campo del codice monouso).
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const qui = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(qui, '..', 'allianz', 'quote-service.mjs'), 'utf8');

const esiti = [];
const prova = (nome, fn) => {
  try { const m = fn(); esiti.push([true, nome, m || '']); }
  catch (e) { esiti.push([false, nome, e.message]); }
};
const deve = (c, msg) => { if (!c) throw new Error(msg); };

function corpoDi(firma) {
  const i = src.indexOf(firma);
  if (i < 0) return null;
  let liv = 0, j = src.indexOf('{', i);
  const inizio = j;
  for (; j < src.length; j++) {
    if (src[j] === '{') liv++;
    else if (src[j] === '}') { liv--; if (liv === 0) return src.slice(inizio, j + 1); }
  }
  return null;
}

// ── 1. Il bivio esiste ───────────────────────────────────────────────────────
prova('senza password il login non si arrende più', () => {
  /* Il difetto vero: `if (!pwdRoot) { log(...); return false; }`. */
  const f = corpoDi('async function autoLoginGrezzo()');
  deve(f, 'autoLoginGrezzo non trovata');
  const i = f.indexOf('if (!pwdRoot)');
  deve(i > 0, 'il punto dove mancava la password non c\'è più: da rileggere a mano');
  const ramo = f.slice(i, i + 700);
  deve(/schermataCodiceMonouso\(\)/.test(ramo),
    'quando la password non compare non si guarda se il portale chiede il codice monouso');
  deve(ramo.indexOf('schermataCodiceMonouso') < ramo.indexOf('return false'),
    'il controllo arriva dopo essersi già arresi');
});

// ── 2. Riconoscere la schermata ──────────────────────────────────────────────
prova('la schermata si riconosce dall\'indirizzo E dal testo', () => {
  /* Solo l'indirizzo non basta: contractcontinue potrebbe comparire anche
     altrove. Solo il testo nemmeno: è una parola comune. */
  const f = corpoDi('async function schermataCodiceMonouso()');
  deve(f, 'manca schermataCodiceMonouso');
  deve(/contractcontinue/.test(f), 'non controlla l\'indirizzo osservato sul portale');
  deve(/monouso|TOTP/i.test(f), 'non controlla il testo della pagina');
});

// ── 3. Il codice arriva davvero nel campo giusto ─────────────────────────────
prova('il campo è quello vero del portale, non un selettore generico', () => {
  /* #nffc non contiene né "otp" né "passcode" né "code": i selettori generici
     di enterPasscode() non lo troverebbero. È il motivo per cui serve una via
     dedicata invece di riusare quella del 2FA Duo. */
  const f = corpoDi('async function inserisciCodiceMonouso(c)');
  deve(f, 'manca inserisciCodiceMonouso');
  deve(/#nffc/.test(f), 'non usa il campo osservato sul portale (#nffc)');
  deve(/#loginButton2/.test(f), 'non preme il pulsante osservato sul portale (#loginButton2)');
});

prova('il codice si genera dal segreto salvato, col ripiego sul manuale', () => {
  const f = corpoDi('async function inserisciCodiceMonouso(c)');
  deve(/totpCode\(c\.totp\)/.test(f), 'non genera il TOTP dal segreto: servirebbe una persona ogni 30 secondi');
  deve(/c\.codice/.test(f), 'manca il ripiego sul codice inserito a mano nel pannello');
});

prova('senza segreto e senza codice non si tenta e si dice perché', () => {
  /* Tentare con un codice vuoto è quello che faceva /otpdump, ed è ciò che ha
     prodotto "Login non riuscito" sul portale: un tentativo bruciato per
     niente, che con il freno conta come fallimento. */
  const f = corpoDi('async function inserisciCodiceMonouso(c)');
  const i = f.indexOf('if (!codice)');
  deve(i > 0, 'non controlla che un codice ci sia');
  deve(i < f.indexOf('page.evaluate'), 'controlla dopo aver già toccato la pagina');
  deve(/Pannello Fonti/.test(f.slice(i, i + 400)), 'non dice dove si mette il codice mancante');
});

// ── 4. Il fallimento dice che cosa fare ──────────────────────────────────────
prova('un codice rifiutato non si confonde con un guasto', () => {
  /* «non accettato» e «segreto da rigenerare» richiedono due gesti diversi:
     il messaggio deve distinguerli, altrimenti si guarda nel posto sbagliato. */
  const f = corpoDi('async function inserisciCodiceMonouso(c)');
  deve(/login non riuscito/i.test(f), 'non legge la risposta del portale');
  deve(/rigenerat/i.test(f), 'non dice che il segreto TOTP va rigenerato');
});

// ── 5. Il freno resta al suo posto ───────────────────────────────────────────
prova('la via nuova passa comunque dal freno', () => {
  /* inserisciCodiceMonouso è chiamata solo da dentro autoLoginGrezzo, che è
     chiamata solo dal frenato: se qualcuno la chiamasse da fuori, un login
     potrebbe partire scavalcando il freno. */
  const chiamate = (src.match(/inserisciCodiceMonouso\(/g) || []).length;
  deve(chiamate === 2, 'inserisciCodiceMonouso compare ' + chiamate + ' volte (attese 2: dichiarazione + unica chiamata)');
  const f = corpoDi('async function autoLoginGrezzo()');
  deve(/inserisciCodiceMonouso\(c\)/.test(f), 'la sola chiamata non è dentro autoLoginGrezzo');
});

let ko = 0;
console.log('\nALLIANZ — utente, poi codice monouso');
for (const [ok, nome, msg] of esiti) {
  console.log(ok ? '  ok  ' + nome : '  X   ' + nome + ' — ' + msg);
  if (!ok) ko++;
}
console.log(`\nALLIANZ TOTP: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
