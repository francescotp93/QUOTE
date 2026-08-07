// ═══════════════════════════════════════════════════════════════════════════════
//  IL CONFINE FRA IL BACKEND E GLI SCRAPER — dove le difese venivano annullate
//
//  Perché esiste. Gli scraper scrivono con cura la differenza fra «ho cercato e
//  non c'e'» e «non ho cercato»:
//
//      // scraper/allianz/quote-service.mjs:981
//      if (!filled) return { ok:false, motivo:'PORTALE_CAMBIATO', targa,
//        errore: "Campo targa non trovato: la ricerca ANIA non e' partita." };
//
//  E il backend la buttava via, in tre modi diversi:
//
//   1. GUARDAVA IL NOME SBAGLIATO. `server/moto.js:391` controllava `d.error`
//      mentre lo scraper scrive `errore`. La guardia non scattava, `d.ok:false`
//      non veniva mai letto, e /moto/ania rispondeva `{ok:true, trovato:false}`.
//      Un «portale cambiato» diventava un «veicolo non presente in ANIA»: la
//      seconda si accetta, la prima si va a guardare.
//
//   2. NON GUARDAVA AFFATTO. `server/moto.js:497` (hub-auto) faceva
//      `await r.json().catch(() => ({}))` e proseguiva: uno scraper spento, un
//      500, una risposta non-JSON diventavano `{}` e poi una risposta HTTP 200
//      con tutti i campi vuoti e NESSUN messaggio. E' il primo passo del wizard
//      RC Auto: l'agente aspettava 20 secondi e non succedeva niente.
//
//   3. INOLTRAVA QUALUNQUE COSA. I sette proxy di `server/fonti.js` facevano
//      `res.json(d)` senza mai leggere `r.ok` ne' il content-type. Uno scraper
//      vecchio interrogato su una rotta nuova risponde 200 con l'elenco dei suoi
//      endpoint: il backend lo girava al browser come se fosse un risultato.
//
//  La regola qui e' una sola: una risposta dello scraper e' un RISULTATO solo se
//  ha superato tutti i controlli. In ogni altro caso e' un GUASTO, e un guasto
//  esce con il suo stato HTTP e con un messaggio che dice che cosa e' successo.
//
//  Niente dipendenze, niente rete, niente Express: si prova senza avviare nulla.
// ═══════════════════════════════════════════════════════════════════════════════

/** Come e' andata la lettura di una risposta dello scraper. */
export const ESITO = {
  OK: 'ok',                                 // risultato buono, usabile
  ERRORE_SCRAPER: 'errore-scraper',         // ha risposto, e ha detto che non ce l'ha fatta
  ROTTA_SCONOSCIUTA: 'rotta-sconosciuta',   // ha risposto l'elenco dei suoi endpoint
  NON_JSON: 'non-json',                     // ha risposto qualcosa che non e' JSON
  HTTP_ERRORE: 'http-errore',               // 4xx / 5xx
  IRRAGGIUNGIBILE: 'irraggiungibile',       // non ha risposto: servizio spento
  TIMEOUT: 'timeout',                       // non ha risposto in tempo
};

const HTTP = {
  [ESITO.OK]: 200,
  [ESITO.ERRORE_SCRAPER]: 502,
  [ESITO.ROTTA_SCONOSCIUTA]: 502,
  [ESITO.NON_JSON]: 502,
  [ESITO.HTTP_ERRORE]: 502,
  [ESITO.IRRAGGIUNGIBILE]: 502,
  [ESITO.TIMEOUT]: 504,
};

/** Che stato HTTP merita questo esito. Deciso qui una volta sola, cosi' le rotte
    non lo decidono ognuna a modo suo. Un guasto non esce MAI come 200. */
export function statoHttp(esito) { return HTTP[esito] || 502; }

/* I nomi con cui gli scraper chiamano il messaggio d'errore. Sono quattro perche'
   sono stati scritti in momenti diversi: `errore` in allianz e moto, `error` in
   axa, groupama, prima e hdi, `avviso` quando il messaggio viene dal portale,
   `msg` nel login guidato. Chi legge non deve indovinare: li accetta tutti. */
const CAMPI_MESSAGGIO = ['errore', 'error', 'avviso', 'messaggio', 'msg'];

/** Il messaggio d'errore di una risposta, comunque si chiami il campo. */
export function messaggioScraper(d) {
  if (!d || typeof d !== 'object') return '';
  for (const k of CAMPI_MESSAGGIO) {
    const v = d[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/* Il motivo in forma di codice: `PORTALE_CAMBIATO` (allianz:981, moto:490) e' il
   caso per cui questo modulo esiste, e non deve mai perdersi per strada. */
const CAMPI_MOTIVO = ['motivo', 'codice', 'motivo_non_loggato'];

/** Il codice del motivo, se lo scraper ne ha dichiarato uno. */
export function motivoScraper(d) {
  if (!d || typeof d !== 'object') return null;
  for (const k of CAMPI_MOTIVO) {
    const v = d[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/**
 * E' l'elenco delle rotte che cinque scraper rispondono — con HTTP 200 — quando
 * il percorso non lo conoscono (allianz:1241, italiana:1697, hdi:2715,
 * moto:694, quotiamo:153). Non e' un risultato: e' un 404 travestito, ed e' il
 * modo in cui uno sfasamento di deploy passava inosservato.
 */
export function eElencoRotte(d) {
  return !!(d && typeof d === 'object' && Array.isArray(d.endpoints) && !('ok' in d));
}

/**
 * Legge una risposta dello scraper e dice se e' un risultato o un guasto.
 *
 * Il chiamante fa la fetch e passa i pezzi gia' letti — cosi' questo modulo
 * resta puro e si prova senza rete:
 *
 *   const r = await fetch(url, { signal });
 *   const testo = await r.text();
 *   const c = leggiRisposta({ http: r.status, contentType: r.headers.get('content-type'), testo });
 *
 * Su errore di rete si passa `erroreRete` con il messaggio dell'eccezione.
 */
export function leggiRisposta({ http, contentType, testo, erroreRete } = {}) {
  // 1. Non ha risposto affatto.
  if (erroreRete != null && erroreRete !== '') {
    const m = String(erroreRete);
    const scaduto = /abort|timeout|timed out|ETIMEDOUT/i.test(m);
    return esitoGuasto(
      scaduto ? ESITO.TIMEOUT : ESITO.IRRAGGIUNGIBILE,
      scaduto
        ? 'Il servizio del portale non ha risposto in tempo: riprova fra un minuto.'
        : 'Il servizio del portale non risponde (probabilmente si sta riavviando): riprova fra un minuto.',
      { dettagli: m.slice(0, 200) },
    );
  }

  // 2. Ha risposto con un codice di errore. Un 500 dello scraper non e' un 200.
  const stato = Number(http);
  const testoPulito = typeof testo === 'string' ? testo : '';
  if (Number.isFinite(stato) && stato >= 400) {
    const d = provaJson(testoPulito);
    const m = messaggioScraper(d);
    return esitoGuasto(
      ESITO.HTTP_ERRORE,
      m || ('Il servizio del portale ha risposto con un errore (HTTP ' + stato + ').'),
      { httpScraper: stato, motivo: motivoScraper(d), dati: d },
    );
  }

  // 3. Ha risposto qualcosa che non e' JSON (una pagina di errore, HTML, vuoto).
  const dati = provaJson(testoPulito);
  if (dati === undefined || dati === null || typeof dati !== 'object') {
    const ct = String(contentType || '').toLowerCase();
    return esitoGuasto(
      ESITO.NON_JSON,
      'Il servizio del portale ha risposto in un formato non previsto: non e\' una risposta valida.',
      { contentType: ct || null, anteprima: testoPulito.slice(0, 120) },
    );
  }

  // 4. Ha risposto l'elenco dei suoi endpoint: la rotta non la conosce.
  if (eElencoRotte(dati)) {
    return esitoGuasto(
      ESITO.ROTTA_SCONOSCIUTA,
      'Il servizio del portale non conosce questa richiesta: probabilmente e\' a una versione diversa dal backend.',
      { rotte: dati.endpoints },
    );
  }

  // 5. Ha risposto, e ha detto di no. E' il caso che veniva perso.
  const messaggio = messaggioScraper(dati);
  const motivo = motivoScraper(dati);
  if (dati.ok === false || (dati.ok !== true && messaggio)) {
    return esitoGuasto(
      ESITO.ERRORE_SCRAPER,
      messaggio || 'Il portale non ha portato a termine l\'operazione.',
      { motivo, dati },
    );
  }

  // 6. Risultato buono.
  return { ok: true, esito: ESITO.OK, http: 200, dati, messaggio: '', motivo };
}

function esitoGuasto(esito, messaggio, extra = {}) {
  const fuori = {
    ok: false,
    esito,
    http: statoHttp(esito),
    messaggio,
    motivo: extra.motivo || null,
    dati: extra.dati || null,
  };
  for (const k of ['httpScraper', 'contentType', 'anteprima', 'rotte', 'dettagli']) {
    if (extra[k] !== undefined) fuori[k] = extra[k];
  }
  return fuori;
}

function provaJson(testo) {
  if (typeof testo !== 'string' || !testo.trim()) return undefined;
  try { return JSON.parse(testo); } catch { return undefined; }
}

/**
 * Il corpo da restituire al browser quando la lettura e' un guasto.
 *
 * Porta `error` (il nome che il frontend gia' legge ovunque), e accanto il
 * motivo e l'esito, cosi' `PORTALE_CAMBIATO` arriva fino a schermo invece di
 * essere appiattito in «non trovato».
 */
export function corpoErrore(c, aggiunte = {}) {
  const fuori = { ok: false, error: c.messaggio, esito: c.esito };
  if (c.motivo) fuori.motivo = c.motivo;
  if (c.httpScraper) fuori.http_scraper = c.httpScraper;
  return Object.assign(fuori, aggiunte);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LO STATO DI UNA FONTE — «pronta» voleva dire «non lo so»
//
//  `server/fonti.js:80` traduceva qualunque guasto in `'pronta'`, che nel
//  pannello e' LO STESSO VERDE di `'attiva'`:
//
//      if (!d || d.url == null) return { stato: configurato ? 'pronta' : 'non_configurata' };
//
//  Bastava un username salvato perche' ECONNREFUSED, un abort dopo 3,5 s, una
//  risposta non-JSON e un 500 diventassero tutti «Configurata», in verde. La
//  rotta gemella del 24H (`mappa24h`, :216) faceva gia' la cosa giusta:
//  `'spento'`. Non era una scelta, era una dimenticanza.
// ═══════════════════════════════════════════════════════════════════════════════

export const STATO = {
  ATTIVA: 'attiva',                   // scraper su e dentro al portale
  SCADUTA: 'scaduta',                 // scraper su, sessione caduta, rientro in corso
  BLOCCATA: 'bloccata',               // scraper su, sessione caduta, rientro FERMATO dal freno
  SPENTO: 'spento',                   // scraper non raggiungibile
  NON_CONFIGURATA: 'non_configurata', // non ci sono credenziali
  DA_VERIFICARE: 'da_verificare',     // risponde, ma non dice abbastanza per decidere
  ERRORE: 'errore',                   // risponde in modo non interpretabile
};

/** Gli stati in cui la fonte e' davvero utilizzabile. Solo questi possono
    accendere il verde: tutto il resto e' «non adesso». */
export function eOperativo(stato) { return stato === STATO.ATTIVA; }

/**
 * Da una risposta della sonda allo stato mostrato nel pannello.
 *
 * @param risposta  quello che torna da `sondaScraper`: { ok, dati, da }
 *                  `da` vale 'rete' | 'cache' | 'interruttore'
 * @param configurato        c'e' un username salvato per questa fonte?
 * @param credenzialiNelloStore  il BACKEND riesce a leggere quelle credenziali?
 *                  Se il backend le legge e lo scraper dice di no, la chiave di
 *                  cifratura dei due processi non e' la stessa: vedi `diagnosi`.
 */
export function statoFonte({ risposta, configurato, credenzialiNelloStore } = {}) {
  // Non ha risposto: spento. Non «pronta», non verde. Se poi la fonte non e'
  // nemmeno configurata, «non configurata» dice di piu' che «spento».
  if (!risposta || !risposta.ok) {
    if (!configurato) return { stato: STATO.NON_CONFIGURATA, url: null, diagnosi: null };
    return {
      stato: STATO.SPENTO,
      url: null,
      diagnosi: risposta && risposta.da === 'interruttore' ? 'gia-dato-per-spento' : 'nessuna-risposta',
    };
  }

  const d = risposta.dati;
  if (!d || typeof d !== 'object') return { stato: STATO.ERRORE, url: null, diagnosi: 'risposta-non-interpretabile' };

  /* UNA SESSIONE VIVA VALE PIU' DI UN CAMPO NELLO STORE.
     Se lo scraper dice di essere dentro al portale, la fonte e' attiva anche
     senza credenziali salvate: la sessione vive nel profilo Chromium su disco,
     non nell'archivio. E' il caso del 24H, che di credenziali non ne ha per
     costruzione (tipo 'sessione'), e di Allianz dopo un login fatto a mano. */
  if (d.loggato === true) {
    const chiaveDiversaOra = d.ha_credenziali === false && credenzialiNelloStore === true;
    return { stato: STATO.ATTIVA, url: d.url != null ? d.url : null, diagnosi: chiaveDiversaOra ? 'credenziali-non-leggibili-dallo-scraper' : null };
  }

  /* IL FRENO TIRATO NON E' UNA SESSIONE SCADUTA.
     `scraper/comune/freno.mjs:90` espone { bloccato, tentativi_falliti,
     prossimo_tentativo, motivo }, e tre scraper lo allegano al proprio stato
     (allianz:914, italiana:1110, hdi:1706). Il backend non lo leggeva, quindi
     la fonte usciva 'scaduta' e il pannello scriveva «il rientro e' partito,
     riprova fra un minuto». E' il contrario del vero: dopo tre accessi falliti
     di fila il freno ha SMESSO di riprovare, apposta, per non far bloccare
     l'utenza dalla compagnia — e riparte solo con un codice nuovo messo a mano.
     Chi legge «riprova fra un minuto» aspetta un rientro che non arrivera'.
     Va dopo `loggato`: il freno ferma i tentativi di ACCESSO, quindi se la
     sessione e' gia' viva non riguarda nessuno. */
  const freno = d.freno;
  if (freno && typeof freno === 'object' && freno.bloccato === true) {
    return {
      stato: STATO.BLOCCATA,
      url: d.url != null ? d.url : null,
      diagnosi: 'freno-tirato',
      motivo: typeof freno.motivo === 'string' && freno.motivo ? freno.motivo : null,
      tentativi_falliti: Number.isFinite(freno.tentativi_falliti) ? freno.tentativi_falliti : null,
    };
  }

  // Risponde ma non dice dove si trova, oppure non dichiara se e' dentro:
  // non e' un guasto conclamato, ma nemmeno una fonte che si puo' usare.
  if (d.url == null || d.loggato === undefined) {
    return { stato: STATO.DA_VERIFICARE, url: d.url != null ? d.url : null, diagnosi: 'stato-incompleto' };
  }

  // Non e' dentro, e non ha credenziali da cui ripartire.
  if (!configurato && d.ha_credenziali !== true) {
    return { stato: STATO.NON_CONFIGURATA, url: d.url, diagnosi: null };
  }

  /* Le credenziali ci sono e il backend le legge, ma lo scraper dice di no:
     i due processi non stanno usando la stessa FONTI_SECRET. E' il caso che
     produceva la diagnosi peggiore possibile — «cambia la password» quando la
     password e' giusta. Il valore della chiave non compare da nessuna parte:
     si confrontano due booleani. */
  const chiaveDiversa = d.ha_credenziali === false && credenzialiNelloStore === true;
  return {
    stato: STATO.SCADUTA,
    url: d.url,
    diagnosi: chiaveDiversa ? 'credenziali-non-leggibili-dallo-scraper'
      : (d.ha_credenziali === false ? 'credenziali-assenti' : null),
  };
}

/* Le frasi che accompagnano una diagnosi. Stanno qui e non nel pannello perche'
   sono la parte che dice CHE COSA FARE, ed e' l'unica cosa che serve davvero a
   chi guarda una fonte rossa. Nessuna di queste stringhe contiene un segreto. */
const FRASI = {
  'credenziali-non-leggibili-dallo-scraper':
    'Le credenziali sono salvate e il pannello le legge, ma il servizio del portale non riesce ad aprirle: '
    + 'i due processi non stanno usando la stessa chiave di cifratura (FONTI_SECRET). '
    + 'Reinserire la password NON serve: va allineata la chiave del servizio a quella del backend.',
  'credenziali-assenti':
    'Il servizio del portale non trova le credenziali (utente e password): inseriscile qui sotto e salva.',
  'freno-tirato':
    'Dopo piu\' accessi falliti di fila il servizio ha smesso di riprovare, per non far bloccare '
    + 'l\'utenza dalla compagnia. Non ripartira\' da solo e non serve aspettare: l\'unica cosa che '
    + 'lo fa ripartire e\' mettere un codice nuovo dal pannello.',
  'nessuna-risposta':
    'Il servizio del portale non risponde: e\' spento o si sta riavviando.',
  'gia-dato-per-spento':
    'Il servizio del portale non risponde da piu\' tentativi di fila: e\' dato per spento finche\' non torna.',
  'stato-incompleto':
    'Il servizio del portale risponde ma non dichiara se e\' dentro: stato da verificare.',
  'risposta-non-interpretabile':
    'Il servizio del portale ha risposto in un formato non previsto.',
};

/** La frase da mostrare per una diagnosi. Vuota se non c'e' niente da dire. */
export function frasePerDiagnosi(diagnosi) { return (diagnosi && FRASI[diagnosi]) || ''; }
