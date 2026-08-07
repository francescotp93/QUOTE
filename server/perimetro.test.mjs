// ═══════════════════════════════════════════════════════════════════════════════
//  IL PERIMETRO — ogni rotta pubblica deve essere pubblica APPOSTA
//
//  In server/index.js i router si montano cosi':
//
//      app.use('/crm', requireAuth, crmRouter);     ← protetto
//      app.use('/shop', shopRouter);                ← pubblico
//
//  La differenza fra le due righe e' una parola, e non c'e' niente che la
//  faccia notare. Cosi' `/plurima-explore` — un telecomando che inoltra a
//  127.0.0.1:4xxx, cioe' a TUTTI gli scraper, e fra le operazioni ha anche
//  `/accedi` e la lettura della pagina di quotazione — e' rimasto montato
//  senza guardia, protetto solo da una chiave col valore di ripiego scritto
//  nel sorgente versionato. Nessuno se n'era accorto perche' la riga sembra
//  identica alle altre.
//
//  Questa prova non decide che cosa debba essere pubblico: lo decidi tu, qui
//  sotto. Decide che nessuna rotta possa DIVENTARLO per distrazione. Se domani
//  qualcuno monta un router nuovo senza guardia, diventa rossa e chiede di
//  scrivere il perche' in questo elenco.
//
//      node server/perimetro.test.mjs
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const INDEX = path.join(__dir, 'index.js');

const esiti = [];
const prova = (nome, fn) => {
  try { const m = fn(); esiti.push([true, nome, m || '']); }
  catch (e) { esiti.push([false, nome, e.message]); }
};
const deve = (c, msg) => { if (!c) throw new Error(msg); };

/* LE ROTTE CHE DEVONO ESSERE RAGGIUNGIBILI SENZA LOGIN, E PERCHE'.
   Chi aggiunge una voce qui si sta assumendo una responsabilita': scrivere il
   motivo non e' burocrazia, e' la cosa che permette a chi legge fra sei mesi di
   capire se vale ancora. */
const PUBBLICHE_APPOSTA = {
  '/shop': 'e\' il negozio online: il cliente compra e paga senza avere un account (Stripe, PayPal, bonifico)',
  '/sign': 'il cliente firma da un link ricevuto per email: se dovesse autenticarsi non potrebbe firmare',
  '/firma-collab': 'il collaboratore firma il mandato prima di avere un accesso',
  '/fonti': 'solo la sotto-rotta di cattura pubblica (publicFontiRouter); il resto del Pannello Fonti e\' dietro requireAuth alla riga successiva',
  '/lead': 'i moduli di contatto del sito pubblico',
  '/iam-lead': 'i moduli di contatto del sito pubblico',
  '/hdi': 'callback della compagnia: arriva da fuori e non ha un token nostro',
  '/assistant': 'widget di assistenza sulle pagine pubbliche',
  '/catalogo': 'il listino prodotti e\' mostrato sul sito pubblico prima del login',
  '/mail': 'solo publicMail (:70); la parte riservata e\' dietro requireAuth alla riga dopo',
  '/pay': 'solo publicPay (:74): il cliente paga senza account; securePay e\' protetto alla riga dopo',
  '/l': 'link brevi e anteprime Open Graph: devono aprirsi da WhatsApp e dalle email',
};

const src = fs.readFileSync(INDEX, 'utf8');

/** Tutti i montaggi `app.use('/qualcosa', ...)`, con quello che c'e' dopo. */
function montaggi() {
  const out = [];
  const re = /app\.use\(\s*'([^']+)'\s*,([^)]*)\)/g;
  let m;
  while ((m = re.exec(src))) {
    const percorso = m[1];
    if (!percorso.startsWith('/')) continue;      // app.use(express.json()) e simili
    out.push({ percorso, resto: m[2], guardato: /requireAuth/.test(m[2]) });
  }
  return out;
}

// ── 1. Nessuna rotta pubblica per distrazione ────────────────────────────────
prova('ogni rotta senza guardia e\' dichiarata pubblica apposta', () => {
  const senzaGuardia = montaggi().filter(x => !x.guardato);
  deve(senzaGuardia.length > 0, 'non sono riuscito a leggere i montaggi di index.js: e\' cambiata la forma?');
  const radice = p => '/' + (p.split('/')[1] || '');
  const impreviste = senzaGuardia.filter(x => !(radice(x.percorso) in PUBBLICHE_APPOSTA));
  deve(impreviste.length === 0,
    'queste rotte sono raggiungibili SENZA LOGIN e nessuno ha scritto perche\': '
    + impreviste.map(x => x.percorso).join(', ')
    + ' — o si aggiunge la guardia requireAuth, o si aggiunge la voce in PUBBLICHE_APPOSTA con il motivo');
  return senzaGuardia.length + ' rotte pubbliche, tutte motivate';
});

// ── 2. Il telecomando degli scraper non deve tornare ─────────────────────────
prova('nessun proxy verso gli scraper e\' esposto senza autenticazione', () => {
  /* `plurimaExplore` inoltra a 127.0.0.1 su qualunque porta 4xxx: raggiunge
     tutti e dieci gli scraper. Fra le operazioni ci sono `/accedi` (fa partire
     un login VERO sul portale di una compagnia), `/logindump` e `/explore`, che
     restituisce i campi della pagina di quotazione — cioe' codice fiscale,
     cognome, nome e data di nascita del contraente. Il modulo si dichiara
     temporaneo nella sua prima riga: «rimuovere dopo l'uso». */
  const montato = /app\.use\(\s*'\/plurima-explore'/.test(src);
  deve(!montato || /app\.use\(\s*'\/plurima-explore'[^)]*requireAuth/.test(src),
    '/plurima-explore e\' di nuovo montato senza requireAuth: da li\' si leggono i dati del contraente '
    + 'e si fanno partire login veri sui portali, senza alcuna autenticazione');
});

// ── 3. Una chiave di ripiego nel sorgente non e' una protezione ──────────────
prova('nessuna guardia si regge su una chiave scritta nel codice', () => {
  /* `const KEY = process.env.EXPLORE_KEY || '<valore letterale>'` sembra una
     protezione e non lo e': il valore sta nel repository, e nessun file di
     deploy imposta quella variabile. Qui si controlla la FORMA, non il valore:
     nessun segreto viene letto ne' stampato. */
  /* Solo i moduli che index.js importa davvero. plurimaMap.js e
     restorePortali.js hanno lo stesso difetto ma non sono montati da nessuna
     parte: sono codice morto, non una porta aperta, e segnalarli qui farebbe
     gridare al lupo una prova che deve restare credibile. */
  const importati = new Set();
  const reImp = /from\s+'\.\/([\w.-]+\.js)'/g;
  let mi;
  while ((mi = reImp.exec(src))) importati.add(mi[1]);

  const sospetti = [];
  for (const f of fs.readdirSync(__dir).filter(x => x.endsWith('.js') && importati.has(x))) {
    const t = fs.readFileSync(path.join(__dir, f), 'utf8');
    const re = /process\.env\.(\w*(?:KEY|SECRET|TOKEN|PASSWORD)\w*)\s*\|\|\s*'([^']{8,})'/g;
    let m;
    while ((m = re.exec(t))) {
      // Il ripiego di FONTI_SECRET e' costruito e documentato apposta (fonti.js):
      // non e' un valore letterale segreto, e senza di esso il pannello non parte.
      if (/^withus-fonti-/.test(m[2])) continue;
      sospetti.push(f + ' → ' + m[1]);
    }
  }
  deve(sospetti.length === 0,
    'queste guardie hanno un valore di ripiego scritto nel sorgente, quindi in esercizio non proteggono niente: '
    + sospetti.join(', ') + ' (il valore non viene stampato)');
  return 'nessuna chiave di ripiego nel sorgente';
});

let ko = 0;
console.log('\nPERIMETRO — chi puo\' bussare senza avere un account');
for (const [ok, nome, msg] of esiti) {
  console.log(ok ? '  ok  ' + nome + (msg ? ' — ' + msg : '') : '  X   ' + nome + ' — ' + msg);
  if (!ok) ko++;
}
console.log(`\nPERIMETRO: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
