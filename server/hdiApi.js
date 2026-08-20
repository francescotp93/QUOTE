// ── HDI · Partner API ─────────────────────────────────────────────────────────
//  Il collegamento alle API ufficiali di HDI (OAS 3.1, 169 rotte).
//
//  PERCHE' ESISTE. Oggi HDI lo interroghiamo con uno scraper di 2746 righe che
//  tiene in piedi un Chromium su un display virtuale: se il portale cambia una
//  pagina, si rompe; se la sessione scade, serve una persona. Queste API
//  parlano da macchina a macchina — niente browser, niente sessione umana.
//
//  COME SI AUTENTICA. OAuth2 `client_credentials`. Nel file scaricato da HDI il
//  campo `scopes` e' VUOTO: non c'e' niente da chiedere nella richiesta. I
//  permessi sono attaccati alla nostra utenza da HDI, sul loro server. Quindi
//  qui il token si chiede e basta — e se una rotta non ci e' permessa, HDI
//  risponde 403 e noi lo diciamo chiaro invece di far finta di niente.
//
//  CONFIGURAZIONE (solo variabili d'ambiente, mai nel codice):
//    HDI_API_BASE      https://platform-cert.hdia.it        (collaudo)
//    HDI_TOKEN_URL     https://platform-cert.hdia.it/security/idp/oauth/token
//    HDI_CLIENT_ID     rilasciato da HDI
//    HDI_CLIENT_SECRET rilasciato da HDI
//
//  Finche' le credenziali non ci sono, il modulo NON si rompe e non prova a
//  chiamare: risponde «non configurato» e lo dice. E' pensato per stare in
//  produzione spento, e accendersi quando HDI risponde.
//
//  Qui NON si importa express: le rotte stanno in hdiApiRoutes.js. Cosi' questo
//  file si puo' collaudare ovunque, anche dove le dipendenze del server non
//  sono installate — ed e' proprio il pezzo che ha bisogno di prove.

const BASE      = () => (process.env.HDI_API_BASE || 'https://platform-cert.hdia.it').replace(/\/$/, '');
const TOKEN_URL = () => process.env.HDI_TOKEN_URL || (BASE() + '/security/idp/oauth/token');
const CLIENT_ID = () => process.env.HDI_CLIENT_ID || '';
const SECRET    = () => process.env.HDI_CLIENT_SECRET || '';

export function hdiConfigurato() { return !!(CLIENT_ID() && SECRET()); }

/* Quale ambiente stiamo interrogando. Serve a non scoprire troppo tardi che si
   stava quotando sul collaudo: i premi di cert non sono premi veri. */
export function hdiAmbiente() {
  return /(-cert|\.cert|test|collaudo|sandbox)/i.test(BASE()) ? 'collaudo' : 'produzione';
}

// ── Il token ──────────────────────────────────────────────────────────────────
/* Il token vive in memoria e si riusa finche' e' valido. Chiederne uno nuovo a
   ogni chiamata funzionerebbe, ma raddoppia le richieste verso HDI e in una
   giornata di quotazioni si sente.

   MARGINE DI 60 SECONDI: un token che scade fra mezzo secondo e' gia' scaduto
   quando la richiesta arriva dall'altra parte. E' il difetto classico delle
   cache di token, e non si vede mai in prova — si vede in produzione, una volta
   ogni tanto, senza motivo apparente. */
const MARGINE_MS = 60_000;
let TOKEN = null;   // { valore, scadeIl }

export function hdiScordaToken() { TOKEN = null; }

/* `adesso` e `fetchImpl` sono iniettabili: servono alle prove per far scadere un
   token senza aspettare un'ora davvero. In esercizio restano i predefiniti. */
export async function hdiToken(opz = {}) {
  const ora = opz.adesso || Date.now();
  const chiama = opz.fetchImpl || fetch;
  if (TOKEN && TOKEN.scadeIl - MARGINE_MS > ora) return TOKEN.valore;
  if (!hdiConfigurato()) {
    const e = new Error('HDI non configurato: mancano HDI_CLIENT_ID e HDI_CLIENT_SECRET nel file .env della VPS.');
    e.codice = 'NON_CONFIGURATO';
    throw e;
  }

  /* Le credenziali viaggiano nell'intestazione Basic, non nel corpo: e' la forma
     raccomandata da OAuth2, e tiene il segreto fuori dai log dei proxy che
     registrano i corpi delle richieste. */
  const basic = Buffer.from(CLIENT_ID() + ':' + SECRET()).toString('base64');
  let r;
  try {
    r = await chiama(TOKEN_URL(), {
      method: 'POST',
      headers: { Authorization: 'Basic ' + basic, 'Content-Type': 'application/x-www-form-urlencoded' },
      /* Nessuno `scope`: il file di HDI ne dichiara zero. Mandarne uno inventato
         farebbe rifiutare la richiesta. */
      body: 'grant_type=client_credentials',
    });
  } catch (err) {
    const e = new Error('HDI non raggiungibile: ' + (err && err.message || err));
    e.codice = 'IRRAGGIUNGIBILE';
    throw e;
  }

  const testo = await r.text();
  if (!r.ok) {
    /* Il corpo di una risposta di errore puo' contenere l'eco delle credenziali:
       non finisce nel messaggio. Chi deve indagare guarda i log di HDI. */
    const e = new Error(r.status === 401
      ? 'HDI ha rifiutato le credenziali (401): client id o secret sbagliati, o utenza non abilitata.'
      : 'HDI non ha rilasciato il token (HTTP ' + r.status + ').');
    e.codice = r.status === 401 ? 'CREDENZIALI' : 'TOKEN_NEGATO';
    e.stato = r.status;
    throw e;
  }

  let dati;
  try { dati = JSON.parse(testo); } catch { dati = null; }
  const valore = dati && (dati.access_token || dati.accessToken);
  if (!valore) {
    const e = new Error('HDI ha risposto senza token: formato inatteso.');
    e.codice = 'TOKEN_ASSENTE';
    throw e;
  }
  /* `expires_in` e' in secondi. Se manca, si assume un'ora: e' il valore di
     riferimento di OAuth2, e col margine sopra resta prudente. */
  const durata = Number(dati.expires_in || dati.expiresIn || 3600);
  TOKEN = { valore, scadeIl: ora + (isFinite(durata) && durata > 0 ? durata : 3600) * 1000 };
  return valore;
}

// ── Una chiamata qualsiasi, autenticata ───────────────────────────────────────
/* Tutte le 169 rotte passano di qui: il token si aggiunge in un posto solo, e
   quando scade nel mezzo (401) si riprova UNA volta con un token nuovo.
   Una sola: un ciclo di ritentativi su un 401 vero diventa un martellamento. */
export async function hdiChiama(percorso, opz = {}) {
  const chiama = opz.fetchImpl || fetch;
  const esegui = async (token) => chiama(BASE() + percorso, {
    method: opz.method || 'GET',
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/json',
      ...(opz.body ? { 'Content-Type': 'application/json' } : {}),
      ...(opz.headers || {}),
    },
    ...(opz.body ? { body: typeof opz.body === 'string' ? opz.body : JSON.stringify(opz.body) } : {}),
  });

  let token = await hdiToken(opz);
  let r = await esegui(token);
  if (r.status === 401 && !opz._giaRiprovato) {
    hdiScordaToken();
    token = await hdiToken(opz);
    r = await esegui(token);
  }

  const testo = await r.text();
  let dati = null;
  try { dati = testo ? JSON.parse(testo) : null; } catch { dati = null; }

  if (!r.ok) {
    /* 403 va detto per quello che e': non un guasto, ma un permesso che la
       nostra utenza non ha. E' la risposta che ci aspettiamo sulle rotte di
       emissione finche' HDI non ce le abilita. */
    const e = new Error(r.status === 403
      ? 'HDI: questa operazione non e\' abilitata per la nostra utenza (403). Va chiesta a loro.'
      : 'HDI ha risposto HTTP ' + r.status + ' su ' + percorso);
    e.codice = r.status === 403 ? 'NON_ABILITATO' : 'ERRORE_HDI';
    e.stato = r.status;
    e.corpo = (testo || '').slice(0, 400);
    throw e;
  }
  return dati;
}

// ── Prima rotta: dati veicolo da targa ────────────────────────────────────────
/* GET /api/v2/road/getCarDataRE?plate=…
   E' la piu' innocua delle 169 — legge e basta — ed e' quella che oggi facciamo
   con lo scraper (/hubveicolo, /motor-targa). Serve a confrontare: finche' i
   due non danno la stessa risposta su targhe vere, lo scraper non si tocca. */
export async function hdiDatiVeicolo(targa, opz = {}) {
  const t = String(targa || '').toUpperCase().replace(/\s+/g, '');
  if (!t) { const e = new Error('Targa mancante.'); e.codice = 'TARGA_MANCANTE'; throw e; }
  return hdiChiama('/api/v2/road/getCarDataRE?plate=' + encodeURIComponent(t), opz);
}

/* Tre letture che servono solo a raccontare lo stato dal backend. Del client id
   esce l'inizio, del segreto niente: uno stato che stampa una credenziale e'
   una credenziale in un log. */
export function hdiBase() { return BASE(); }
export function hdiClientIdCorto() { return CLIENT_ID() ? CLIENT_ID().slice(0, 4) + '…' : null; }
export function hdiHaToken() { return !!TOKEN; }
