// ═══════════════════════════════════════════════════════════════════════════════
//  LE FONTI, DAL VIVO — il Pannello Fonti risponde alla domanda «funziona?»
//
//  A che serve, e perché non è una prova come le altre.
//
//  Le altre prove del repository girano ovunque: leggono file, eseguono calcoli,
//  fingono i provider. Questa no. Questa parla con i dieci servizi veri delle
//  compagnie, che girano solo sulla VPS. Per questo NON si chiama «.test.mjs»:
//  non deve finire nella suite automatica, dove sarebbe rossa su ogni computer
//  che non è la VPS — e una prova rossa per il motivo sbagliato è peggio di una
//  prova che non c'è.
//
//  COSA RISPONDE. Una domanda sola, con sì o no:
//
//      «la realtà corrisponde alla mappa qui sotto?»
//
//  La mappa (ATTESE) dice, compagnia per compagnia, cosa ci aspettiamo oggi e
//  PERCHÉ. Se la realtà è peggiorata — un servizio spento, una sessione caduta —
//  esce rosso. Ma esce rosso anche se è MIGLIORATA, ed è voluto: una mappa che
//  non si aggiorna quando le cose cambiano smette di dire qualcosa, e diventa
//  esattamente il tipo di verde che non guarda niente.
//
//  COSA NON FA DA SOLA. Non tocca i portali delle compagnie. La diagnosi legge e
//  basta. L'accesso vero si chiede a mano:
//
//      node server/verifica/fonti-vive.mjs                    # solo diagnosi
//      node server/verifica/fonti-vive.mjs --accedi groupama  # prova ad entrare
//      node server/verifica/fonti-vive.mjs --json             # per farci qualcosa
//
//  Perché a mano: ogni tentativo di accesso è un tentativo vero su un portale
//  vero, e dopo tre falliti il freno blocca la compagnia per un quarto d'ora.
//  Quel freno ci protegge dal farci bloccare l'utenza dell'agenzia, che si
//  sblocca solo telefonando. Non è una cosa da consumare per abitudine.
//
//  USCITA:  0 = la realtà corrisponde alla mappa
//           1 = non corrisponde (peggiorata o migliorata: c'è scritto quale)
//           2 = qui non si può eseguire (i servizi non ci sono: non è la VPS)
// ═══════════════════════════════════════════════════════════════════════════════

const BASE = process.env.FONTI_BASE || 'http://127.0.0.1';

/* ── LA MAPPA ────────────────────────────────────────────────────────────────
   Aggiornata il 20/08/2026, provando davvero. Ogni riga dice cosa ci aspettiamo
   e perché: il «perché» è la parte che vale, perché è quella che dice a chi
   legge se c'è qualcosa da fare o no.

   sessione:
     'viva'          — dentro, si può quotare
     'da_rifare'     — il servizio c'è e sa entrare, ma le credenziali non
                       vanno più: è un dato da sistemare, non un guasto
     'non_possibile' — non ci si entra da un server, e non è una cosa che si
                       aggiusta con una password
     'non_lo_dice'   — il servizio risponde ma non dichiara se è dentro. NON è
                       «non è dentro»: è «non lo so», e vanno tenute distinte
   ────────────────────────────────────────────────────────────────────────── */
const ATTESE = {
  '24h':      { porta: 4100, sessione: 'non_lo_dice',   perche: 'Login per sessione del browser: lo scraper non dichiara se è dentro.' },
  allianz:    { porta: 4200, sessione: 'da_rifare',     perche: 'Serve il seme del codice a 6 cifre, che non abbiamo ancora.' },
  italiana:   { porta: 4300, sessione: 'viva',          perche: 'L\'unica dentro al 20/08/2026. Se cade, si vede qui.' },
  hdi:        { porta: 4400, sessione: 'da_rifare',     perche: 'Servizio acceso, mai avviato l\'accesso (passo «idle»).' },
  groupama:   { porta: 4500, sessione: 'da_rifare',     perche: 'Provato il 20/08/2026: il portale ha rifiutato utente/password.' },
  prima:      { porta: 4600, sessione: 'non_possibile', perche: 'Prima blocca gli accessi dai server (Cloudflare). Serve l\'estensione Chrome o un proxy residenziale: non è una password da cambiare.' },
  axa:        { porta: 4700, sessione: 'da_rifare',     perche: 'Serve il codice AXA Guardian a ogni accesso.' },
  assieasy:   { porta: 4800, sessione: 'da_rifare',     perche: 'Servizio acceso e pronto, accesso mai avviato.' },
  kube:       { porta: 4900, sessione: 'da_rifare',     perche: 'Servizio acceso e pronto, accesso mai avviato.' },
  quotiamo:   { porta: 5000, sessione: 'non_lo_dice',   perche: 'Lo scraper risponde ma non dichiara se è dentro.' },
};

const args = process.argv.slice(2);
const JSON_PURO = args.includes('--json');
const daAccedere = (() => {
  const i = args.indexOf('--accedi');
  if (i < 0) return [];
  return String(args[i + 1] || '').split(',').map(s => s.trim()).filter(Boolean);
})();

const dice = (...x) => { if (!JSON_PURO) console.log(...x); };

async function chiedi(porta, percorso, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(BASE + ':' + porta + percorso, { signal: ctrl.signal });
    return await r.json();
  } catch { return null; }
  finally { clearTimeout(t); }
}

/* Cosa dice di sé una fonte, adesso. */
async function guarda(id, att) {
  const [stato, login] = await Promise.all([
    chiedi(att.porta, '/status'),
    chiedi(att.porta, '/loginstate'),
  ]);
  const raggiungibile = !!(stato || login);
  /* «NON HO POTUTO CHIEDERE» NON È «NON ME L'HA DETTO».
     Prima versione: se /status non rispondeva entro 8 secondi, il valore
     restava nullo e la fonte finiva sotto «non lo dice» — cioè una risposta
     dello scraper, che invece non c'era stata. Due letture a due minuti di
     distanza si sono contraddette su assieasy e quotiamo proprio per questo:
     uno strumento di misura che confonde il silenzio con una risposta non
     misura niente. Adesso si richiede una seconda volta, con più pazienza, e
     se ancora niente lo si dice per quello che è. (20/08/2026) */
  let s2 = stato;
  if (!s2 && login) s2 = await chiedi(att.porta, '/status', 15000);
  const l = s2 ? s2.loggato : undefined;
  const sessione = !raggiungibile ? 'servizio_spento'
    : (!s2 ? 'non_interrogabile'
      : (l === true ? 'viva' : (l === false ? 'non_viva' : 'non_lo_dice')));
  const stato2 = s2;
  return {
    id, porta: att.porta, raggiungibile, sessione,
    passo: login ? String(login.step || '') : null,
    messaggio: login ? String(login.msg || '').slice(0, 200) : '',
    credenziali: stato2 ? stato2.ha_credenziali : null,
    codice_a_sei_cifre: stato2 ? (stato2.ha_totp ?? null) : null,
    freno: stato2 && stato2.freno ? stato2.freno : null,
  };
}

/* Cosa dovremmo VEDERE, se la mappa dice il vero. Tenere la traduzione in un
   posto solo evita di scrivere due volte, in due modi diversi, la stessa
   frase — che è il modo in cui una regola si sdoppia e poi diverge. */
const ATTESO_SI_VEDE_COME = {
  viva: 'viva',
  da_rifare: 'non_viva',
  non_possibile: 'non_viva',
  non_lo_dice: 'non_lo_dice',
};

/* La realtà corrisponde a quello che c'è scritto nella mappa? */
function confronta(att, vero) {
  if (!vero.raggiungibile) return { esito: 'peggiorata', dettaglio: 'il servizio non risponde' };
  if (vero.sessione === 'non_interrogabile') {
    return { esito: 'peggiorata', dettaglio: 'risponde a /loginstate ma non a /status: non si riesce a sapere se è dentro' };
  }
  const dovrebbe = ATTESO_SI_VEDE_COME[att.sessione];
  if (vero.sessione === dovrebbe) return { esito: 'come_atteso' };

  if (vero.sessione === 'viva') {
    return { esito: 'migliorata', dettaglio: att.sessione === 'non_lo_dice' ? 'adesso dichiara di essere dentro' : 'è entrata' };
  }
  if (dovrebbe === 'viva') return { esito: 'peggiorata', dettaglio: 'la sessione è caduta' };
  /* Resta il caso in cui la fonte cambia idea su QUANTO dichiara: prima diceva
     se era dentro e adesso non lo dice più, o viceversa. Non è un guasto, ma è
     una riga di mappa diventata falsa — e una mappa falsa si corregge subito,
     non «quando capita». */
  return {
    esito: 'peggiorata',
    dettaglio: vero.sessione === 'non_lo_dice'
      ? 'non dichiara più se è dentro (la mappa dice «' + att.sessione + '»)'
      : 'adesso dichiara di essere fuori (la mappa dice «' + att.sessione + '»)',
  };
}

/* L'accesso vero. Si chiede a mano, una compagnia per volta. */
async function accedi(id, att) {
  dice('\n──────── accesso a ' + id + ' (porta ' + att.porta + ') ────────');
  const prima = await chiedi(att.porta, '/status');
  const freno = prima && prima.freno;
  if (freno && freno.bloccato) {
    dice('  FERMO: il freno è tirato — ' + (freno.motivo || 'troppi tentativi falliti') +
         (freno.prossimo_tentativo ? ' · si riprova dalle ' + new Date(freno.prossimo_tentativo).toLocaleTimeString('it-IT') : ''));
    dice('  Non insisto: il freno è quello che ci evita di farci bloccare l\'utenza dalla compagnia.');
    return { id, esito: 'frenato', motivo: freno.motivo || null };
  }

  dice('  premo Accedi…');
  await chiedi(att.porta, '/accedi', 30000);

  let ultimo = null;
  for (let i = 1; i <= 12; i++) {
    await new Promise(r => setTimeout(r, 10000));
    ultimo = await chiedi(att.porta, '/loginstate');
    const passo = ultimo ? String(ultimo.step || '') : '(non risponde)';
    const msg = ultimo ? String(ultimo.msg || '').slice(0, 140) : '';
    dice('  [' + String(i * 10).padStart(3) + 's] ' + passo + (msg ? '  ·  ' + msg : ''));
    if (['loggato', 'attesa_otp', 'attesa_codice', 'non_loggato', 'error', 'errore', 'senza_credenziali', 'timeout_otp'].includes(passo)) break;
  }

  const passo = ultimo ? String(ultimo.step || '') : '';
  const esito = passo === 'loggato' ? 'dentro'
    : (['attesa_otp', 'attesa_codice'].includes(passo) ? 'serve_il_codice' : 'non_riuscito');
  dice('  → ' + esito.replace(/_/g, ' ').toUpperCase() +
       (ultimo && ultimo.msg ? ': ' + String(ultimo.msg).slice(0, 180) : ''));
  if (esito === 'serve_il_codice') {
    dice('  Il codice a 6 cifre si consegna così, da questa macchina:');
    dice('    curl -s "' + BASE + ':' + att.porta + '/codice?codice=NNNNNN"');
  }
  return { id, esito, passo, messaggio: ultimo ? String(ultimo.msg || '') : '' };
}

// ── esecuzione ───────────────────────────────────────────────────────────────
const righe = [];
for (const [id, att] of Object.entries(ATTESE)) {
  const vero = await guarda(id, att);
  righe.push({ ...vero, atteso: att.sessione, perche: att.perche, ...confronta(att, vero) });
}

const vivi = righe.filter(r => r.raggiungibile).length;
if (vivi === 0) {
  if (JSON_PURO) console.log(JSON.stringify({ eseguibile: false, motivo: 'nessun servizio raggiungibile' }));
  else {
    console.log('\nNESSUN SERVIZIO RISPONDE su ' + BASE + ':4100-5000.');
    console.log('Questa prova parla con i servizi veri delle compagnie: gira sulla VPS,');
    console.log('non su un computer di lavoro. Da qui non si può dire niente di sensato.\n');
  }
  process.exit(2);
}

const SIMBOLO = {
  viva: 'DENTRO', non_viva: 'fuori', non_lo_dice: 'non lo dice',
  servizio_spento: 'SPENTO', non_interrogabile: 'muto',
};

dice('\nLE FONTI, DAL VIVO — ' + new Date().toLocaleString('it-IT'));
dice('');
dice('  ' + 'FONTE'.padEnd(11) + 'SESSIONE'.padEnd(13) + 'ATTESA'.padEnd(16) + 'ESITO');
for (const r of righe) {
  const segno = r.esito === 'come_atteso' ? 'ok  ' : (r.esito === 'migliorata' ? '+   ' : 'X   ');
  dice('  ' + segno + r.id.padEnd(11) + String(SIMBOLO[r.sessione] || r.sessione).padEnd(13) +
       r.atteso.padEnd(16) + (r.esito === 'come_atteso' ? '' : r.esito + ' — ' + r.dettaglio));
}

const fuoriMappa = righe.filter(r => r.esito !== 'come_atteso');
if (fuoriMappa.length) {
  dice('');
  for (const r of fuoriMappa) {
    dice('  ' + r.id + ': ' + r.dettaglio + '.');
    if (r.messaggio) dice('    il servizio dice: ' + r.messaggio);
    dice('    nella mappa c\'è scritto: ' + r.perche);
  }
}

dice('');
dice('  Perché non sono dentro, in breve:');
for (const r of righe.filter(x => x.sessione !== 'viva')) {
  dice('    · ' + r.id.padEnd(10) + (r.messaggio || r.perche));
}

const esiti = [];
for (const id of daAccedere) {
  if (!ATTESE[id]) { dice('\n(«' + id + '» non è una fonte che conosco)'); continue; }
  esiti.push(await accedi(id, ATTESE[id]));
}

if (JSON_PURO) {
  console.log(JSON.stringify({ eseguibile: true, fonti: righe, accessi: esiti }, null, 1));
} else {
  dice('');
  dice(fuoriMappa.length === 0
    ? 'LA REALTÀ CORRISPONDE ALLA MAPPA: ' + righe.length + ' fonti, nessuna sorpresa.'
    : 'LA REALTÀ NON CORRISPONDE ALLA MAPPA: ' + fuoriMappa.length + ' su ' + righe.length +
      '. Guarda sopra, poi aggiorna ATTESE in questo file — una mappa vecchia non dice più niente.');
  dice('');
}
process.exit(fuoriMappa.length === 0 ? 0 : 1);
