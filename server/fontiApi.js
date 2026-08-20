// ═══════════════════════════════════════════════════════════════════════════════
//  API v1 — FONTI  (il pannello dei portali compagnia, richiamabile da IAM)
//
//  Il pannello Fonti esiste da tempo e funziona: 28 rotte in server/fonti.js più
//  la vigilanza in fontiWatchdog.js. Il problema non era il codice, era che si
//  poteva usare SOLO dalla pagina di QUOTO, con il login utente. IAM per
//  mostrarlo doveva aprire QUOTO dentro un riquadro.
//
//  Questo file NON riscrive quelle rotte: ci passa davanti. Riceve la chiamata
//  di IAM, controlla la chiave interna, la gira al router che c'è già e
//  riconfeziona la risposta nell'involucro concordato. Riscrivere la logica
//  avrebbe voluto dire due pannelli Fonti che un giorno divergono, e uno dei due
//  sbagliato senza che nessuno se ne accorga.
//
//  DUE LIVELLI DI PERMESSO
//   · leggere lo stato e fare accedere una fonte  → basta la chiave interna;
//   · scrivere credenziali, creare o togliere una fonte → serve ANCHE
//     l'intestazione X-Operatore con chi ha premuto il pulsante.
//  La chiave dice «sono IAM», non dice «è stato Tizio». Le credenziali dei
//  portali sono la cosa più delicata che abbiamo: se un giorno la chiave finisce
//  in mano sbagliata, con la chiave sola non si deve poter scrivere una
//  password. E nel registro deve restare un nome, non un server.
//
//  LE PASSWORD NON ESCONO. In lettura si dice solo se ci sono (ha_password), mai
//  quali sono: è la stessa regola che il pannello segue già verso il browser.
// ═══════════════════════════════════════════════════════════════════════════════
import express from 'express';
import { ok, ko, ora, chiaveInterna } from './apiComune.js';

/* Le rotte in scrittura: quelle che toccano credenziali o l'elenco delle fonti.
   Elencate una per una e non dedotte dal metodo HTTP, perché POST /:id/accedi è
   una POST ma non scrive niente — chiedere l'operatore anche lì vorrebbe dire
   che la vigilanza automatica, che operatore non ne ha, non può più rientrare. */
const SCRITTURE = [
  ['POST',   /^\/?$/],
  ['PUT',    /^\/[^/]+$/],
  ['DELETE', /^\/[^/]+$/],
  ['POST',   /^\/[^/]+\/credenziali$/],
  ['DELETE', /^\/[^/]+\/credenziali$/],
];

/* IL CANCELLO E IL ROUTER DEVONO GUARDARE LA STESSA COSA.
   Le espressioni qui sopra sono ancorate e sensibili alle maiuscole. Il router
   di Express, di suo, non lo è: ignora la barra finale e compila i percorsi con
   il flag «i». Fra le due regole si apriva una fessura — «/allianz/credenziali/»
   e «/allianz/CREDENZIALI» erano scritture per il router e NON scritture per il
   cancello: la password di un portale si scriveva con la sola chiave interna e
   senza lasciare un nome nel registro.

   Trovato da una revisione avversariale il 20/08/2026 e riprodotto con un
   server vero. Adesso il percorso si normalizza PRIMA di decidere, e il router
   qui sotto nasce «strict» e «caseSensitive»: due serrature sulla stessa porta,
   e le due regole non possono più divergere. */
function normalizza(percorso) {
  const p = String(percorso || '').toLowerCase();
  return p.length > 1 ? (p.replace(/\/+$/, '') || '/') : p;
}

function eScrittura(metodo, percorso) {
  const p = normalizza(percorso);
  const m = String(metodo || '').toUpperCase();
  return SCRITTURE.some(([mm, re]) => mm === m && re.test(p));
}

/* Dal codice HTTP interno al codice del contratto. La traduzione sta qui e in
   nessun altro posto: ogni rotta che se la scrivesse da sé finirebbe per
   chiamare «non trovato» qualcosa che invece è spento. */
function codiceDa(stato, corpo) {
  if (stato === 400) return 'INVALID_INPUT';
  if (stato === 401 || stato === 403) return 'FORBIDDEN';
  if (stato === 404) return 'NOT_FOUND';
  if (stato === 504) return 'TIMEOUT';
  if (String((corpo && corpo.error) || '').toLowerCase().includes('timeout')) return 'TIMEOUT';
  return 'PROVIDER_UNAVAILABLE';
}

/* I passi dell'accesso, come li racconta lo scraper, tradotti nei pochi stati
   che IAM deve saper disegnare. Gli scraper ne hanno una decina e cambiano da
   compagnia a compagnia: se IAM li leggesse tutti, ogni nuova compagnia
   sarebbe una modifica dentro IAM.

   L'elenco è tutto il vocabolario che gli scraper usano davvero, ricavato con
   grep sui loro quote-service: AXA dice «error», HDI dice «errore» e
   «senza_credenziali». Mancavano, e un login HDI già fallito veniva raccontato
   a IAM come «in_corso» per sempre — la rotellina girava e nessuno andava a
   rimettere la password. Trovato dalla revisione del 20/08/2026. */
const PASSI = {
  idle: 'pronto',
  pronto: 'pronto',
  avvio: 'in_corso',
  credenziali: 'in_corso',
  invio_totp: 'in_corso',
  invio_otp: 'in_corso',
  attesa_otp: 'serve_codice',
  attesa_codice: 'serve_codice',
  loggato: 'completo',
  non_loggato: 'fallito',
  timeout_otp: 'fallito',
  error: 'fallito',              // AXA, Prima, Allianz
  errore: 'fallito',             // HDI
  senza_credenziali: 'fallito',  // HDI: non c'è niente da provare
};

function statoAccesso(d) {
  if (!d || typeof d !== 'object') return 'fallito';
  if (d.loggato === true) return 'completo';
  const passo = String(d.step || d.login_step || '');
  if (PASSI[passo]) return PASSI[passo];
  /* Un passo che non conosciamo, ma il servizio dice che sta lavorando: è in
     corso. Meglio «aspetta» che «è andata male» — il secondo fa premere di
     nuovo Accedi e ricomincia da capo un login che stava riuscendo.
     Se invece è FERMO su un passo che non conosciamo, non è «in corso»: è
     finito e non sappiamo come. Dirlo «in corso» lascerebbe girare la
     rotellina all'infinito, che è il modo peggiore di sbagliare. */
  if (d.running === true || d.login_running === true) return 'in_corso';
  return 'fallito';
}

/* Chiama una rotta del pannello che c'è già e riporta indietro stato e corpo,
   senza toccare la risposta vera. Il router di Express non ha bisogno di una
   richiesta HTTP vera: gli bastano metodo, percorso, corpo e query. */
function chiediAlPannello(router, { metodo, percorso, corpo, query, headers, utente }) {
  return new Promise((risolvi) => {
    const req = {
      method: metodo, url: percorso, originalUrl: percorso, baseUrl: '',
      headers: headers || {}, body: corpo || {}, query: query || {}, params: {},
      /* Il pannello è riservato al Super Admin e lo verifica leggendo
         req.user.email. Qui l'utente l'ha già controllato IAM: la chiave
         interna è la prova che la domanda arriva da IAM e non da fuori. */
      user: utente,
      get(n) { return this.headers[String(n).toLowerCase()]; },
    };
    let stato = 200;
    const res = {
      statusCode: 200,
      status(n) { stato = n; this.statusCode = n; return this; },
      json(o) { risolvi({ stato, corpo: o }); return this; },
      send(o) { risolvi({ stato, corpo: o }); return this; },
      end(o) { risolvi({ stato, corpo: o || null }); return this; },
      setHeader() { return this; }, set() { return this; }, type() { return this; },
    };
    try {
      router.handle(req, res, () => risolvi({ stato: 404, corpo: { error: 'Rotta non prevista dal pannello.' } }));
    } catch (e) {
      risolvi({ stato: 500, corpo: { error: String(e && e.message || e) } });
    }
  });
}

export function creaApiFonti(conf) {
  const pannello = conf.pannello;               // fontiRouter
  const vigilanza = conf.vigilanza;             // vigilanzaRouter
  const superAdmin = String(conf.superAdmin || '');
  const chiave = conf.chiave || '';
  const log = conf.log || (() => {});

  /* strict + caseSensitive: il router accetta ESATTAMENTE i percorsi che il
     cancello qui sotto sa riconoscere. Senza, «/allianz/credenziali/» sarebbe
     una rotta valida che il cancello non vede passare. */
  const r = express.Router({ strict: true, caseSensitive: true });
  r.use(chiaveInterna(chiave, log));

  /* Il secondo cancello: chi ha premuto. */
  r.use((req, res, next) => {
    const operatore = String(req.headers['x-operatore'] || '').trim();
    if (eScrittura(req.method, req.path) && !operatore) {
      log({ evento: 'scrittura_senza_operatore', rotta: normalizza(req.path), metodo: req.method, quando: ora() });
      return res.status(403).json(ko('FORBIDDEN',
        'Questa operazione tocca le credenziali: serve l\'intestazione X-Operatore con chi l\'ha chiesta.'));
    }
    req.operatore = operatore || null;
    next();
  });

  const utente = { email: superAdmin, via: 'api-v1' };

  /* Un solo posto che gira la domanda e riconfeziona la risposta. */
  async function gira(req, res, router, percorso, opzioni) {
    const o = opzioni || {};
    const esito = await chiediAlPannello(router, {
      metodo: o.metodo || req.method,
      percorso,
      corpo: req.body,
      query: req.query,
      headers: req.headers,
      utente,
    });
    if (req.operatore) {
      log({ evento: 'scrittura_fonti', operatore: req.operatore, rotta: req.path,
            metodo: req.method, esito: esito.stato, quando: ora() });
    }
    const c = esito.corpo && typeof esito.corpo === 'object' ? esito.corpo : {};
    if (esito.stato >= 400 || c.error) {
      return res.status(esito.stato >= 400 ? esito.stato : 502)
        .json(ko(codiceDa(esito.stato, c), String(c.error || 'Il pannello Fonti non ha risposto.')));
    }
    const { ok: _scarta, ...resto } = c;
    return res.json(ok(o.trasforma ? o.trasforma(resto) : resto));
  }

  // ── Lettura ────────────────────────────────────────────────────────────────
  r.get('/', (req, res) => gira(req, res, pannello, '/'));
  r.get('/salute', (req, res) => gira(req, res, pannello, '/salute'));
  r.get('/vigilanza', (req, res) => gira(req, res, vigilanza, '/'));

  /* Una fonte sola. Il pannello non ha una rotta per questo: si chiede
     l'elenco e si prende la riga. Costa uguale — l'elenco sonda tutti gli
     scraper in parallelo, non uno per volta. */
  r.get('/:id', async (req, res) => {
    const esito = await chiediAlPannello(pannello, {
      metodo: 'GET', percorso: '/', corpo: {}, query: {}, headers: req.headers, utente,
    });
    const elenco = (esito.corpo && esito.corpo.fonti) || [];
    const f = elenco.find(x => x.id === req.params.id);
    if (!f) return res.status(404).json(ko('NOT_FOUND', 'Fonte «' + req.params.id + '» inesistente.'));
    res.json(ok({ fonte: f }));
  });

  // ── Accesso guidato: si avvia e si guarda, non si aspetta ──────────────────
  r.post('/:id/accedi', (req, res) =>
    gira(req, res, pannello, '/' + req.params.id + '/accedi'));

  r.get('/:id/accesso', async (req, res) => {
    const esito = await chiediAlPannello(pannello, {
      metodo: 'GET', percorso: '/' + req.params.id + '/loginstate',
      corpo: {}, query: {}, headers: req.headers, utente,
    });
    const c = esito.corpo && typeof esito.corpo === 'object' ? esito.corpo : {};
    if (esito.stato >= 400 || c.error) {
      return res.status(esito.stato >= 400 ? esito.stato : 502)
        .json(ko(codiceDa(esito.stato, c), String(c.error || 'Il servizio della fonte non risponde.')));
    }
    const stato = statoAccesso(c);
    res.json(ok({
      fonte: req.params.id,
      stato,
      messaggio: String(c.msg || c.login_msg || ''),
      /* Nessuno scraper mette un campo «loggato» in /loginstate: il vero
         segnale è il passo. Leggendo solo c.loggato questo campo era SEMPRE
         false, anche ad accesso riuscito — e IAM ci avrebbe scritto sopra un
         pallino rosso su una sessione viva. Adesso viene dallo stato tradotto,
         che è l'unica cosa che sappiamo davvero. */
      loggato: stato === 'completo',
      /* Il passo grezzo resta visibile: serve a chi guarda un guasto, e non
         obbliga nessuno a leggerlo per far funzionare il pannello. */
      passo_tecnico: String(c.step || c.login_step || ''),
    }));
  });

  r.post('/:id/codice', (req, res) =>
    gira(req, res, pannello, '/' + req.params.id + '/conferma-codice'));
  r.post('/:id/altro-codice', (req, res) =>
    gira(req, res, pannello, '/' + req.params.id + '/altro-codice'));
  r.post('/:id/verifica', (req, res) =>
    gira(req, res, pannello, '/' + req.params.id + '/verifica'));
  r.post('/vigilanza/giro', (req, res) =>
    gira(req, res, vigilanza, '/giro'));

  // ── Scrittura: da qui in giù serve X-Operatore (controllato sopra) ─────────
  r.post('/', (req, res) => gira(req, res, pannello, '/'));
  r.put('/:id', (req, res) => gira(req, res, pannello, '/' + req.params.id));
  r.delete('/:id', (req, res) => gira(req, res, pannello, '/' + req.params.id));
  r.post('/:id/credenziali', (req, res) => gira(req, res, pannello, '/' + req.params.id + '/credenziali'));
  r.delete('/:id/credenziali', (req, res) => gira(req, res, pannello, '/' + req.params.id + '/credenziali'));

  return r;
}
