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

/* I commenti vanno tolti prima di guardare l'ORDINE delle cose: qui dentro
   spiegano il difetto e nominano le funzioni sbagliate apposta («enterPasscode
   non trova #nffc»). Contandoli, una prova sull'ordine legge il commento invece
   del codice e fallisce su codice corretto — è successo scrivendola. */
function senzaCommenti(s) {
  return String(s || '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function corpoDi(firma, sorgente = src) {
  const i = sorgente.indexOf(firma);
  if (i < 0) return null;
  let liv = 0, j = sorgente.indexOf('{', i);
  const inizio = j;
  for (; j < sorgente.length; j++) {
    if (sorgente[j] === '{') liv++;
    else if (sorgente[j] === '}') { liv--; if (liv === 0) return sorgente.slice(inizio, j + 1); }
  }
  return null;
}

/* Il sorgente ripulito dai commenti, con i corpi ritagliati DA QUESTO: cercare
   un corpo preso dal sorgente commentato dentro quello ripulito non lo trova
   mai, e la prova fallisce senza che nulla sia rotto. */
const srcNC = senzaCommenti(src);

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
  /* La regola non e' cambiata, ha cambiato casa: dal 02/09/2026 e' passcodeDa()
     a decidere DA DOVE viene il codice, cosi' che il motivo di un rifiuto si
     possa dire (e provare) senza aprire un browser. La prova segue la regola,
     non la riga in cui stava. */
  const f = corpoDi('function passcodeDa(c)');
  deve(f, 'manca passcodeDa: nessuno decide piu\' da dove viene il codice');
  deve(/totpCode\(seme\)/.test(f), 'non genera il TOTP dal segreto: servirebbe una persona ogni 30 secondi');
  deve(/c\.codice/.test(f), 'manca il ripiego sul codice inserito a mano nel pannello');
  deve(/inserisciCodiceMonouso/.test(src) && /passcodeDa\(c\)/.test(corpoDi('async function inserisciCodiceMonouso(c)')),
    'chi scrive nel campo non passa piu\' da passcodeDa');
});

prova('senza segreto e senza codice non si tenta e si dice perché', () => {
  /* Tentare con un codice vuoto è quello che faceva /otpdump, ed è ciò che ha
     prodotto "Login non riuscito" sul portale: un tentativo bruciato per
     niente, che con il freno conta come fallimento. */
  const f = corpoDi('async function inserisciCodiceMonouso(c)');
  const i = f.indexOf('if (!codice)');
  deve(i > 0, 'non controlla che un codice ci sia');
  deve(i < f.indexOf('page.evaluate'), 'controlla dopo aver già toccato la pagina');
  // Il «perché» lo scrive passcodeDa e lo riporta il chiamante: qui si controlla
  // che arrivi fino a chi legge, invece di fermarsi nel log del server.
  deve(/Pannello Fonti/.test(corpoDi('function passcodeDa(c)')), 'non dice dove si mette il codice mancante');
  deve(/motivo/.test(f.slice(i, i + 400)), 'il motivo resta nel log e non torna a chi ha premuto');
});

// ── 4. Il fallimento dice che cosa fare ──────────────────────────────────────
prova('un codice rifiutato non si confonde con un guasto', () => {
  /* «non accettato» e «segreto da rigenerare» richiedono due gesti diversi:
     il messaggio deve distinguerli, altrimenti si guarda nel posto sbagliato. */
  const f = corpoDi('async function inserisciCodiceMonouso(c)');
  deve(/login non riuscito/i.test(f), 'non legge la risposta del portale');
  /* «Rigenera il segreto» era la frase buona per tutte le stagioni, e il
     2 settembre ha mandato Francesco a rigenerare un seme che non era il
     problema. Ora il consiglio esiste ancora, ma SOLO dove serve: quando nel
     campo un seme c'e' davvero. La prova chiede questo, non la frase. */
  const frasi = corpoDi('function esitoCodiceRifiutato(rifiutato, seme)');
  deve(frasi, 'manca esitoCodiceRifiutato: la spiegazione torna a inventarsela ogni chiamante');
  deve(/rigenerat/i.test(frasi), 'non dice mai che il segreto TOTP va rigenerato');
  deve(/semePlausibile\(seme\)/.test(frasi), 'consiglia di rigenerare senza guardare se un seme c\'e\'');
});

// ── 5. Il freno resta al suo posto ───────────────────────────────────────────
prova('la via nuova non parte mai da sola scavalcando il freno', () => {
  /* Questa prova contava le chiamate e ne pretendeva esattamente due. Contare
     era il MEZZO; il FINE è che nessun ritentativo AUTOMATICO parta senza
     passare dal freno. Il 14/08/2026 la via del codice monouso è stata
     agganciata anche ai due pulsanti del pannello, e la prova è diventata
     rossa su codice corretto: quei due non sono ritentativi automatici, sono
     una persona che preme un pulsante — ed è l'unico gesto che il freno
     ammette. Ora si controlla il fine. */
  const ammessi = ['async function autoLoginGrezzo()', 'async function doAccediGuidato()', 'async function doCodiceGuidato(code)'];
  const corpiAmmessi = ammessi.map(f => corpoDi(f, srcNC)).filter(Boolean);
  deve(corpiAmmessi.length === ammessi.length, 'una delle funzioni ammesse non esiste più');

  /* Tolgo la DICHIARAZIONE (firma compresa: la firma contiene il nome seguito
     da una parentesi, e senza toglierla si conta come una chiamata) e i corpi
     ammessi. Il taglio va fatto per INDICE: fra la firma e la graffa c'è uno
     spazio, quindi rimettere insieme «firma + corpo» produce una stringa che
     nel sorgente non esiste, e la rimozione non toglie niente. */
  const firmaDich = 'async function inserisciCodiceMonouso(c)';
  const iDich = srcNC.indexOf(firmaDich);
  const corpoDich = corpoDi(firmaDich, srcNC) || '';
  const fineDich = srcNC.indexOf(corpoDich, iDich) + corpoDich.length;
  deve(iDich >= 0 && corpoDich, 'inserisciCodiceMonouso non è più dichiarata');
  let resto = srcNC.slice(0, iDich) + srcNC.slice(fineDich);
  for (const c of corpiAmmessi) resto = resto.replace(c, '');
  const fuoriPosto = (resto.match(/inserisciCodiceMonouso\(/g) || []).length;
  deve(fuoriPosto === 0,
    'inserisciCodiceMonouso è chiamata da ' + fuoriPosto + ' punto/i fuori da autoLoginGrezzo e dai pulsanti del pannello: ' +
    'un accesso potrebbe partire scavalcando il freno');

  const f = corpoDi('async function autoLoginGrezzo()');
  deve(/inserisciCodiceMonouso\(c\)/.test(f), 'la via automatica non la chiama più');
  return corpiAmmessi.length + ' punti di partenza, tutti leciti';
});

// ── 6. Il pannello parla la stessa lingua del login automatico ───────────────
prova('il pulsante «Accedi al portale» non pretende più una password', () => {
  /* Il difetto visto da Francesco il 14/08/2026: il pannello rispondeva
     «La schermata password non è comparsa dopo l'utente» mentre il login
     automatico, sulla stessa macchina e sullo stesso portale, sapeva già che
     di password non ce n'è più. Il fix del 02/08 era stato agganciato solo
     alla via automatica, e nessuno se n'era accorto perché è il pannello
     quello che si usa a mano. */
  const f = corpoDi('async function doAccediGuidato()', srcNC);
  deve(f, 'doAccediGuidato non trovata');
  deve(!/!c\.username \|\| !c\.password/.test(f),
    'si ferma ancora subito se manca la password: con Allianz la password non esiste più');
  deve(/schermataCodiceMonouso\(\)/.test(f),
    'non riconosce la schermata del codice monouso: rifarebbe l\'errore di prima');
  /* Il messaggio che Francesco ha visto a schermo non deve più esistere: era
     una diagnosi sbagliata, non un guasto da segnalare meglio. */
  deve(!/La schermata password non è comparsa/.test(srcNC),
    'il messaggio fuorviante «La schermata password non è comparsa» è ancora lì');
  /* Il codice monouso va guardato prima di ogni resa che riguardi la PASSWORD.
     Le rese precedenti — manca l'utente, campo utente non trovato — devono
     restare dove sono: senza nome utente non c'è nessuna schermata da
     riconoscere. Pretendere che il controllo venga prima di QUALUNQUE errore
     era la regola sbagliata, ed è stata rossa su codice corretto. */
  const iCodice = f.indexOf('schermataCodiceMonouso');
  for (const dopo of ['!c.password', 'pagina di accesso è cambiata']) {
    const j = f.indexOf(dopo);
    deve(j < 0 || iCodice < j,
      'controlla il codice monouso dopo essersi già occupato della password (' + dopo + ')');
  }
});

prova('il pulsante «Accedi col codice» sa in quale schermata si trova', () => {
  /* Il campo nuovo si chiama #nffc e non contiene né "otp" né "passcode" né
     "code": enterPasscode() non lo trova, e il codice digitato a mano finiva
     nel vuoto con «campo codice non trovato». Le due schermate vogliono due
     strade diverse. */
  const f = senzaCommenti(corpoDi('async function doCodiceGuidato(code)'));
  deve(f, 'doCodiceGuidato non trovata');
  deve(/schermataCodiceMonouso\(\)/.test(f), 'non distingue la schermata OSP da quella di Duo');
  deve(f.indexOf('schermataCodiceMonouso') < f.indexOf('enterPasscode'),
    'prova prima la strada di Duo: sulla schermata nuova fallirebbe con «campo codice non trovato»');
});

// ── 7. «Configurata» non vuol dire «ha una password» ─────────────────────────
prova('una fonte con utente e segreto TOTP risulta configurata', () => {
  /* Lo stato mostrato dal pannello contava solo la password: una fonte con
     utente e segreto TOTP — cioè la configurazione GIUSTA per Allianz oggi —
     veniva segnalata come incompleta. */
  deve(!/ha_credenziali: !!\(c\.username && c\.password\)/.test(src),
    'lo stato conta ancora solo la password: la configurazione corretta risulta incompleta');
  deve(/c\.password \|\| c\.totp \|\| c\.codice/.test(src),
    'lo stato non considera il segreto TOTP come modo valido di entrare');
});

prova('senza nessun modo di entrare non ci prova nemmeno', () => {
  /* Un invio a vuoto è esattamente quello che ha prodotto «Login non
     riuscito» sul portale, e col freno un tentativo bruciato conta come
     fallimento: meglio non partire. */
  const f = corpoDi('async function autoLoginGrezzo()');
  deve(/!c\.password && !c\.totp && !c\.codice/.test(f),
    'parte anche quando non c\'è né password, né segreto TOTP, né codice');
  deve(!/!c\.username \|\| !c\.password/.test(f), 'pretende ancora la password per partire');
});

let ko = 0;
console.log('\nALLIANZ — utente, poi codice monouso');
for (const [ok, nome, msg] of esiti) {
  console.log(ok ? '  ok  ' + nome : '  X   ' + nome + ' — ' + msg);
  if (!ok) ko++;
}
console.log(`\nALLIANZ TOTP: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
