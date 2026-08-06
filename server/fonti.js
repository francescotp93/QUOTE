// ═══════════════════════════════════════════════════════════════════════════════
//  Pannello Fonti — gestione banche dati esterne per lo scraping (solo Super Admin)
//  - Stato sessione di ogni fonte (24H Assistance: live dallo scraper; Allianz: da config)
//  - Credenziali cifrate a riposo (AES-256-GCM) salvate in fonti.store.json
//  - Codice di verifica (2FA app) per Allianz, usato al prossimo login
//  I segreti NON vengono mai rimandati al browser: si espongono solo booleani/maschere.
// ═══════════════════════════════════════════════════════════════════════════════
import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// Sonda: interroga gli scraper IN PARALLELO, con micro-cache e interruttore automatico.
// Prima l'elenco fonti chiedeva lo stato a uno scraper per volta (6s di attesa ciascuno):
// con 3 servizi spenti il pannello impiegava ~50s ad aprirsi. Vedi server/fontiSonda.js.
import { sondaScraper, sondaTutte, invalidaSonda, statoInterruttori } from './fontiSonda.js';
// Confine con gli scraper: una risposta e' un risultato solo se ha superato i
// controlli (r.ok, content-type, JSON, ok:false, elenco endpoint). Vedi
// server/confineScraper.js per il perche' di ognuno.
import { leggiRisposta, corpoErrore, statoFonte, frasePerDiagnosi } from './confineScraper.js';

export const fontiRouter = Router();

/* Come `chiediScraper` di server/moto.js: la duplicazione e' voluta, perche'
   confineScraper.js non deve toccare la rete — e' la proprieta' che permette di
   provarlo per intero senza dipendenze e senza avviare niente. */
async function chiediScraper(url, timeoutMs) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    const testo = await r.text();
    return leggiRisposta({ http: r.status, contentType: r.headers.get('content-type'), testo });
  } catch (e) {
    return leggiRisposta({ erroreRete: (e && e.message) || String(e) });
  } finally { clearTimeout(to); }
}

/* I sette proxy del pannello facevano tutti la stessa cosa:
       const d = await r.json().catch(() => ({})); return res.json(d);
   mai `r.ok`, mai il content-type. Un 500 dello scraper usciva come 200 con
   dentro l'oggetto errore; una pagina HTML usciva come 200 con `{}`; e uno
   scraper vecchio interrogato su una rotta nuova rispondeva l'elenco dei suoi
   endpoint, che il backend girava al browser come se fosse un risultato.
   Adesso passano tutti di qui. */
async function inoltra(res, url, timeoutMs) {
  const c = await chiediScraper(url, timeoutMs);
  if (!c.ok) return res.status(c.http).json(corpoErrore(c));
  return res.json(c.dati);
}

// Router PUBBLICO (senza auth) per ricevere la cattura via sendBeacon dal bookmarklet sul portale Matrix.
// Il bookmarklet gira su portaleagenzie.allianz.it e non ha il token QUOTO: sendBeacon (richiesta
// "semplice") raggiunge comunque il server. Salviamo il corpo grezzo su disco per l'analisi.
export const publicFontiRouter = Router();
publicFontiRouter.post('/allianz/cattura-pub', (req, res) => {
  let raw = '';
  req.on('data', c => { raw += c; if (raw.length > 8000000) req.destroy(); });
  req.on('end', () => {
    try {
      const txt = (raw || '').trim();
      if (txt.length < 5) return res.json({ ok: false });
      const __d = path.dirname(fileURLToPath(import.meta.url));
      fs.writeFileSync(path.join(__d, 'allianz-cattura.json'), txt.slice(0, 8000000));
      res.json({ ok: true, bytes: txt.length });
    } catch { try { res.json({ ok: false }); } catch {} }
  });
  req.on('error', () => { try { res.json({ ok: false }); } catch {} });
});

const SCRAPER = process.env.MOTO_SCRAPER_URL || 'http://127.0.0.1:4100';
const ALLIANZ = process.env.ALLIANZ_SCRAPER_URL || 'http://127.0.0.1:4200';
// Scraper dei portali compagnia dinamici (per id o per nome)
const SCRAPER_URLS = {
  italiana: process.env.ITALIANA_SCRAPER_URL || 'http://127.0.0.1:4300',
  hdi: process.env.HDI_SCRAPER_URL || 'http://127.0.0.1:4400',
  groupama: process.env.GROUPAMA_SCRAPER_URL || 'http://127.0.0.1:4500',
  prima: process.env.PRIMA_SCRAPER_URL || 'http://127.0.0.1:4600',
  axa: process.env.AXA_SCRAPER_URL || 'http://127.0.0.1:4700',
};
function scraperUrlFor(id, nome, cfg) {
  const hay = ((id || '') + ' ' + (nome || '')).toLowerCase();
  if (/itali/.test(hay)) return SCRAPER_URLS.italiana;
  if (/\bhdi\b/.test(hay)) return SCRAPER_URLS.hdi;
  if (/groupama/.test(hay)) return SCRAPER_URLS.groupama;
  if (/prima/.test(hay)) return SCRAPER_URLS.prima;
  if (/axa/.test(hay)) return SCRAPER_URLS.axa;
  // Portali compagnia custom: lo scraper è indicato nella config della fonte (Pannello Fonti)
  // come scraper_url (es. http://127.0.0.1:4400) o scraper_port (4400), così appena lo scraper
  // del nuovo portale è attivo, gli strumenti (Esplora/Cattura/Analizza API) si accendono soli.
  if (cfg && cfg.scraper_url) return String(cfg.scraper_url);
  if (cfg && cfg.scraper_port) return 'http://127.0.0.1:' + cfg.scraper_port;
  // Registro opzionale via env: CUSTOM_SCRAPERS = {"<slug>":"http://127.0.0.1:4400"}
  try { const reg = JSON.parse(process.env.CUSTOM_SCRAPERS || '{}'); if (reg && reg[id]) return String(reg[id]); } catch {}
  return null;
}
// Risolve lo scraper per QUALSIASI fonte: built-in (24h→4100, allianz→4200) o custom.
function anyScraperUrl(id, store) {
  if (id === '24h') return SCRAPER;        // scraper Moto/24H (porta 4100)
  if (id === 'allianz') return ALLIANZ;    // scraper Allianz (porta 4200)
  if (id === 'prima') return SCRAPER_URLS.prima; // scraper Prima (porta 4600)
  const cf = ((store && store.__custom) || {})[id];
  return scraperUrlFor(id, cf && cf.nome, cf);
}
// ── Traduzione risposta scraper → stato mostrato nel pannello ───────────────────
// Gli stati sono sei — attiva | scaduta | spento | non_configurata | da_verificare |
// errore — e solo 'attiva' e' operativo (vedi eOperativo in confineScraper.js). Il dato
// grezzo arriva dalla sonda parallela: rete, micro-cache o interruttore aperto.
/* «pronta» voleva dire «non lo so», ed era VERDE.
   Bastava un username salvato perche' ECONNREFUSED, un abort dopo 3,5 s, una
   risposta non-JSON e un 500 diventassero tutti 'pronta', che in `fontiBadge`
   e' lo stesso verde di 'attiva'. La rotta gemella del 24H (`mappa24h`) faceva
   gia' la cosa giusta — 'spento' — dieci righe sotto: non era una scelta.
   Adesso gli stati sono sei e solo 'attiva' e' operativo. */
function mappaScraper(r, configurato, leggibiliDalBackend) {
  const s = statoFonte({ risposta: r, configurato, credenzialiNelloStore: leggibiliDalBackend });
  const fuori = { stato: s.stato, url: s.url };
  if (s.diagnosi) { fuori.diagnosi = s.diagnosi; fuori.motivo_stato = frasePerDiagnosi(s.diagnosi); }
  return fuori;
}
async function statoScraper(surl, configurato, opt) {
  return mappaScraper(await sondaScraper(surl, opt), configurato);
}
const __dir = path.dirname(fileURLToPath(import.meta.url));
const STORE = process.env.FONTI_STORE || path.join(__dir, 'fonti.store.json');
const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || 'francesco.oddo199307@gmail.com').toLowerCase();

// Chiave di cifratura: idealmente da env FONTI_SECRET. Se assente, deriva una chiave
// stabile (meno robusta, ma evita di salvare le password in chiaro).
const SECRET = process.env.FONTI_SECRET || ('withus-fonti-' + (process.env.HOSTNAME || 'vps') + '-v1');
const KEY = crypto.createHash('sha256').update(SECRET).digest();

function enc(plain) {
  if (plain == null || plain === '') return '';
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return 'v1:' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
function dec(blob) {
  if (!blob || !String(blob).startsWith('v1:')) return '';
  try {
    const raw = Buffer.from(String(blob).slice(3), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', KEY, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch { return ''; }
}
const maschera = s => { const v = String(s || ''); return v ? (v.length <= 2 ? '••' : v[0] + '•'.repeat(Math.min(6, v.length - 2)) + v.slice(-1)) : ''; };

// ── TOTP: nome-campo canonico nello store = `s.totp`. Leggo/accetto anche alias storici per robustezza,
// così un segreto salvato (o inviato dal pannello) sotto un nome diverso non va perso silenziosamente.
const TOTP_STORE_FIELDS = ['totp', 'totpSecret', 'totp_secret', 'otp_secret', 'otpSecret', 'secret_totp', 'otp'];
const storedTotp = s => (s && TOTP_STORE_FIELDS.map(k => s[k]).find(v => v)) || '';
const TOTP_BODY_FIELDS = ['totp_secret', 'totpSecret', 'totp', 'otp_secret', 'otpSecret', 'secret_totp'];
const incomingTotp = b => { for (const k of TOTP_BODY_FIELDS) { if (b && b[k]) return b[k]; } return null; };

// Catalogo fonti. `tipo`: 'sessione' = login persistente (no user/pass nel pannello);
// 'credenziali' = user/password gestiti qui. `has2fa` = richiede codice app.
const FONTI = [
  { id: '24h', nome: '24H Assistance · Moto Platinum', tipo: 'sessione', has2fa: false, url: 'https://www.24hassistance.com', note: 'Login persistente via sessione del browser. Se scade, va rifatto una volta.' },
  { id: 'allianz', nome: 'Allianz', tipo: 'credenziali', has2fa: true, url: 'https://amlogin.allianz.it', note: 'Login con utente/password + codice app. Auto-login in arrivo.' },
];

function load() { try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch { return {}; } }
function save(d) { try { fs.writeFileSync(STORE, JSON.stringify(d, null, 2), { mode: 0o600 }); return true; } catch { return false; } }

// ── Caselle email gestite dal pannello (password cifrate a riposo, come le credenziali) ──
const MAIL_KEY = '__caselle_mail';
function caselleMailRaw() { const d = load(); return (d && d[MAIL_KEY]) || {}; }
// Esportata per il motore mail (server/mail.js): caselle con password in chiaro + host opzionali.
export function caselleMailStore() {
  const m = caselleMailRaw();
  return Object.keys(m).map(email => {
    const c = m[email] || {};
    return {
      email, pass: dec(c.pass),
      imapHost: c.imapHost || undefined,
      imapPort: c.imapPort ? parseInt(c.imapPort, 10) : undefined,
      smtpHost: c.smtpHost || undefined,
      smtpPort: c.smtpPort ? parseInt(c.smtpPort, 10) : undefined,
    };
  }).filter(c => c.email && c.pass);
}

// ── Elenco fonti "tecnico", per la vigilanza automatica (server/fontiWatchdog.js) ──
// Non passa dal router (nessuna richiesta HTTP, nessun utente): serve solo a sapere
// QUALI servizi interrogare e SE hanno le credenziali salvate. Nessun segreto in uscita.
export function elencoFontiTecnico() {
  const store = load();
  const out = [];
  for (const f of FONTI) {
    const s = store[f.id] || {};
    out.push({
      id: f.id, nome: f.nome, tipo: f.tipo, surl: anyScraperUrl(f.id, store),
      ha_credenziali: !!s.username || f.tipo === 'sessione', ha_totp: !!storedTotp(s), attiva: true,
    });
  }
  for (const [id, s] of Object.entries(store.__custom || {})) {
    out.push({
      id, nome: s.nome || id, tipo: 'credenziali', surl: scraperUrlFor(id, s.nome, s),
      ha_credenziali: !!s.username, ha_totp: !!storedTotp(s), attiva: s.attiva !== false,
    });
  }
  return out;
}

// ── Gate: solo Super Admin ─────────────────────────────────────────────────────
fontiRouter.use((req, res, next) => {
  if ((req.user && req.user.email) !== SUPER_ADMIN_EMAIL) return res.status(403).json({ error: 'Riservato al Super Admin.' });
  next();
});

// ── Caselle email (posta Aruba/Gmail/Zimbra) — solo Super Admin ─────────────────
// La password non torna mai al browser: si espone solo una maschera.
fontiRouter.get('/caselle-mail', (req, res) => {
  const m = caselleMailRaw();
  const caselle = Object.keys(m).sort().map(email => {
    const c = m[email] || {};
    return { email, imapHost: c.imapHost || '', smtpHost: c.smtpHost || '', pass_mask: maschera(dec(c.pass)), hasPass: !!c.pass };
  });
  res.json({ caselle });
});
fontiRouter.post('/caselle-mail', (req, res) => {
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Indirizzo email non valido.' });
  const pw = b.password || b.pass || '';
  const d = load(); if (!d[MAIL_KEY]) d[MAIL_KEY] = {};
  const cur = d[MAIL_KEY][email] || {};
  const rec = {
    pass: pw ? enc(pw) : (cur.pass || ''),
    imapHost: (b.imapHost != null ? String(b.imapHost).trim() : (cur.imapHost || '')),
    imapPort: (b.imapPort != null ? String(b.imapPort).trim() : (cur.imapPort || '')),
    smtpHost: (b.smtpHost != null ? String(b.smtpHost).trim() : (cur.smtpHost || '')),
    smtpPort: (b.smtpPort != null ? String(b.smtpPort).trim() : (cur.smtpPort || '')),
  };
  if (!rec.pass) return res.status(400).json({ error: 'Serve la password per una nuova casella.' });
  d[MAIL_KEY][email] = rec;
  if (!save(d)) return res.status(500).json({ error: 'Salvataggio non riuscito.' });
  res.json({ ok: true, email });
});
fontiRouter.delete('/caselle-mail/:email', (req, res) => {
  const email = String(req.params.email || '').trim().toLowerCase();
  const d = load();
  if (d[MAIL_KEY] && d[MAIL_KEY][email]) { delete d[MAIL_KEY][email]; save(d); }
  res.json({ ok: true });
});

// Stato live della fonte 24H, interrogando lo scraper (telecomando HTTP locale).
function mappa24h(r) {
  const d = r && r.ok ? r.dati : null;
  const url = (d && d.url) || '';
  if (!url) return { stato: 'spento', url: null };
  const loggato = !/login\.24hassistance/i.test(url);
  return { stato: loggato ? 'attiva' : 'scaduta', url };
}
async function stato24h(opt) { return mappa24h(await sondaScraper(SCRAPER, opt)); }

// Stato live della fonte Allianz, interrogando il suo scraper (porta 4200).
//  attiva  = scraper su e loggato nel portale  → pallino verde
//  scaduta = scraper su ma non loggato
//  spento  = scraper non raggiungibile
function mappaAllianz(r, configurato, leggibiliDalBackend) {
  return mappaScraper(r, configurato, leggibiliDalBackend);
}
async function statoAllianz(configurato, opt) { return mappaAllianz(await sondaScraper(ALLIANZ, opt), configurato); }

// ── È SPENTO davvero, o è solo la SESSIONE a essere scaduta? ───────────────────
// Quando una chiamata allo scraper va in timeout non sappiamo il perché: il pannello
// diceva sempre "Scraper non raggiungibile (servizio in avvio?)". Il 27 luglio HDI era
// acceso da due giorni e rispondeva benissimo: era la sessione sul portale a essere
// morta. Questa sonda velocissima (3s su /status) permette di dire la verità.
/* Il backend riesce ad aprire le credenziali salvate di questa fonte?
   E' il booleano — non il valore — che distingue «non ci sono» da «ci sono ma
   lo scraper non le apre». Nessun segreto esce da qui. */
function credenzialiLeggibili(id, store) {
  try {
    const s = (store && store[id]) || ((store && store.__custom) || {})[id] || {};
    return !!(s.username && dec(s.username));
  } catch { return false; }
}

async function perche(surl, leggibiliDalBackend) {
  const c = await chiediScraper(surl + '/status', 3000);
  if (!c.ok) {
    if (c.esito === 'irraggiungibile' || c.esito === 'timeout') {
      return { stato: 'spento', diagnosi: 'nessuna-risposta', error: 'Il servizio del portale non risponde (probabilmente si sta riavviando): riprova fra un minuto.' };
    }
    return { stato: 'errore', diagnosi: 'risposta-non-interpretabile', error: c.messaggio };
  }
  const d = c.dati;
  if (d && d.ha_credenziali === false) {
    /* «Non riesce a leggere le credenziali» ha DUE cause, e portano a due gesti
       opposti. Se il backend quelle credenziali le legge (le mostra mascherate
       nel pannello) e lo scraper no, non e' una password sbagliata: i due
       processi non usano la stessa FONTI_SECRET, e reinserire la password non
       serve a niente — la si ricifra con la chiave del backend, che lo scraper
       continua a non avere. Prima si diceva «reinseriscile e salva» in
       entrambi i casi: era il consiglio sbagliato proprio nel caso peggiore.
       Qui si confrontano due booleani: nessun valore di chiave viene letto. */
    const diagnosi = leggibiliDalBackend === true ? 'credenziali-non-leggibili-dallo-scraper' : 'credenziali-assenti';
    return { stato: 'scaduta', diagnosi, error: frasePerDiagnosi(diagnosi) };
  }
  if (d && d.loggato) return { stato: 'attiva', diagnosi: null, error: null };
  if (d && d.loggato === undefined) {
    return { stato: 'da_verificare', diagnosi: 'stato-incompleto', error: frasePerDiagnosi('stato-incompleto') };
  }
  return { stato: 'scaduta', diagnosi: null, error: 'Il servizio è acceso: è la sessione sul portale a essere scaduta. Il rientro è partito, riprova fra un minuto.' };
}

// ── SEGUI UN LOGIN GUIDATO ────────────────────────────────────────────────────
// Gli scraper "guidati" (AXA, HDI, …) non fanno più aspettare chi chiama: /accedi
// avvia il rientro e risponde subito, l'avanzamento si legge su /loginstate.
// Prima il backend aspettava fino a 90s una risposta che poteva arrivare a 150s:
// scattava l'abort e il pannello scriveva "Scraper non raggiungibile" — falso.
// Qui bussiamo una volta e poi guardiamo lo stato finché non si ferma.
const PASSI_FINITI = /^(loggato|non_loggato|senza_credenziali|attesa_codice|attesa_otp|timeout_otp|errore|error|pronto)$/i;
async function seguiLoginGuidato(surl, { attesaMs = 100000, passoMs = 3000, leggibili } = {}) {
  const chiedi = async (path, ms) => {
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), ms);
    try { const r = await fetch(surl + path, { signal: ctrl.signal }); return await r.json().catch(() => ({})); }
    finally { clearTimeout(to); }
  };
  // Bussata iniziale: se lo scraper è ancora del vecchio tipo (bloccante) il timeout
  // breve non è un problema — il rientro parte lo stesso e lo seguiamo con /loginstate.
  let st = null;
  try { st = await chiedi('/accedi', 12000); } catch { /* parte comunque in background */ }
  const scadenza = Date.now() + attesaMs;
  while (Date.now() < scadenza) {
    let s = null;
    try { s = await chiedi('/loginstate', 8000); } catch { s = null; }
    if (s && s.step) {
      st = s;
      if (!s.running && PASSI_FINITI.test(s.step)) break;
    } else if (!st || !st.step) {
      // Scraper senza login guidato: niente polling a vuoto, chiedo direttamente il perché.
      const p = await perche(surl, leggibili);
      return { ok: p.stato === 'attiva', stato: p.stato, error: p.error, diagnosi: p.diagnosi || undefined };
    }
    await new Promise(r => setTimeout(r, passoMs));
  }
  const step = String((st && st.step) || '');
  const msg = (st && st.msg) || '';
  if (/^loggato$/i.test(step)) return { ok: true, stato: 'attiva', url: (st && st.url) || null };
  if (/^(attesa_codice|attesa_otp)$/i.test(step)) return { ok: false, stato: 'scaduta', error: msg || 'Il portale chiede il codice di verifica: scrivilo qui sotto e conferma.' };
  if (/^senza_credenziali$/i.test(step)) return { ok: false, stato: 'non_configurata', error: msg || 'Mancano utente e password di questo portale.' };
  if (!step) { const p = await perche(surl, leggibili); return { ok: p.stato === 'attiva', stato: p.stato, error: p.error, diagnosi: p.diagnosi || undefined }; }
  return { ok: false, stato: 'scaduta', error: msg || 'Accesso al portale non riuscito.' };
}

// Esposti solo per le prove automatiche (fontiLoginGuidato.test.mjs): non fanno
// parte dell'interfaccia del modulo, non usarli altrove.
export const _diagnosi = { perche, seguiLoginGuidato, mappaScraper };

// ── POST /fonti/:id/verifica — forza un (auto)login e ritorna lo stato (pallino) ─
fontiRouter.post('/:id/verifica', async (req, res) => {
  const f = FONTI.find(x => x.id === req.params.id);
  // Portale compagnia dinamico con scraper dedicato
  if (!f) {
    const store = load(); const cf = (store.__custom || {})[req.params.id];
    const surl = cf ? scraperUrlFor(req.params.id, cf.nome, cf) : null;
    if (cf && surl) {
      // Portali a LOGIN GUIDATO (AXA, HDI, …): il loro /login NON blocca più — avvia il
      // rientro e risponde subito. Qui lo seguiamo con /loginstate invece di leggere
      // l'ok immediato (che sarebbe sempre false) o di restare appesi 90s.
      if (LOGIN_GUIDATO.test(req.params.id + ' ' + (cf.nome || ''))) {
        const esito = await seguiLoginGuidato(surl, { leggibili: credenzialiLeggibili(req.params.id, store) });
        invalidaSonda(surl);
        return res.json(esito);
      }
      const tryLogin = async () => { const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 90000); try { const r = await fetch(surl + '/login', { signal: ctrl.signal }); return await r.json().catch(() => ({})); } finally { clearTimeout(to); } };
      try {
        let d;
        try { d = await tryLogin(); }
        catch (e1) { await new Promise(r => setTimeout(r, 4000)); d = await tryLogin(); } // 1 retry: lo scraper poteva essere in riavvio
        // Se lo scraper RISPONDE ma il login non è ancora passato (sessione derivata dopo inattività,
        // o timeout del lock a metà auto-login), ritento UNA volta: al secondo giro la sessione è già
        // "riscaldata" dal primo tentativo e di solito entra. Evita il falso "Accesso non riuscito
        // (scaduta)" mostrato all'utente quando in realtà basta un secondo colpo.
        if (!d || !d.ok) { await new Promise(r => setTimeout(r, 2500)); try { d = await tryLogin(); } catch (e2) { /* tengo l'esito precedente */ } }
        invalidaSonda(surl); // dopo un login la fotografia in cache è vecchia: la butto via
        return res.json({ ok: !!(d && d.ok), stato: (d && d.ok) ? 'attiva' : 'scaduta', url: (d && d.url) || null });
      } catch {
        // Prima si diceva sempre "spento". Ora chiediamo al servizio perché, e diciamo la verità.
        const p = await perche(surl, credenzialiLeggibili(req.params.id, store)); invalidaSonda(surl);
        return res.json({ ok: p.stato === 'attiva', stato: p.stato, error: p.error, diagnosi: p.diagnosi || undefined });
      }
    }
    return res.status(404).json({ error: 'Fonte sconosciuta.' });
  }
  if (f.id === 'allianz') {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 90000); // l'auto-login può richiedere qualche secondo
      const r = await fetch(ALLIANZ + '/login', { signal: ctrl.signal });
      clearTimeout(to);
      const d = await r.json().catch(() => ({}));
      invalidaSonda(ALLIANZ);
      return res.json({ ok: !!d.ok, stato: d.ok ? 'attiva' : 'scaduta', url: d.url || null });
    } catch { invalidaSonda(ALLIANZ); return res.json({ ok: false, stato: 'spento', error: 'Scraper Allianz non raggiungibile (servizio spento?).' }); }
  }
  // forza: la "Verifica" manuale deve sempre chiedere davvero, ignorando cache e interruttore.
  if (f.id === '24h') { const st = await stato24h({ forza: true }); return res.json({ ok: st.stato === 'attiva', ...st }); }
  return res.json({ ok: false, stato: 'non_configurata' });
});

// ── LOGIN GUIDATO A DUE SCHERMATE (Groupama e simili) ──────────────────────────
// Replica il login del portale dentro QUOTO: 1) Accedi (utente+password → OTP via email),
// 2) Conferma codice (sincrono), 3) Invia altro codice. Niente più cicli in background.
// Compagnie il cui scraper espone /accedi /loginstate /codice /resend.
// HDI aggiunta il 27/07: il suo login (Keycloak "uefa") può costare ~150s a freddo,
// più del budget di una singola chiamata HTTP — va seguito, non atteso.
const LOGIN_GUIDATO = /groupama|prima|axa|allianz|hdi/i;
async function proxyScraper(id, store, scraperPath, timeoutMs) {
  const cf = (store.__custom || {})[id];
  const surl = cf ? scraperUrlFor(id, cf.nome, cf) : anyScraperUrl(id, store);
  if (!surl) return { status: 404, body: { error: 'Nessuno scraper per questo portale.' } };
  const c = await chiediScraper(surl + scraperPath, timeoutMs);
  if (c.ok) return { status: 200, body: c.dati };
  /* Non ha risposto affatto: si chiede il PERCHE' invece di dire il solito «non
     raggiungibile». Spesso il servizio c'e' ed e' la sessione a essere morta. */
  if (c.esito === 'irraggiungibile' || c.esito === 'timeout') {
    const p = await perche(surl, credenzialiLeggibili(id, store));
    return { status: p.stato === 'spento' ? 502 : 200, body: { ok: false, stato: p.stato, error: p.error, msg: p.error, diagnosi: p.diagnosi || undefined } };
  }
  /* Ha risposto, ma male (500, non-JSON, elenco endpoint, ok:false): il
     messaggio c'e' gia' ed e' piu' preciso di qualunque diagnosi indiretta. */
  return { status: c.http, body: corpoErrore(c, { msg: c.messaggio }) };
}

// POST /fonti/:id/accedi — schermata 1: invia utente+password, il portale manda l'OTP via email.
fontiRouter.post('/:id/accedi', async (req, res) => {
  const store = load();
  const out = await proxyScraper(req.params.id, store, '/accedi', 165000); // login lunghi (AXA SiteMinder+Auth0 ~90s)
  return res.status(out.status === 502 ? 502 : 200).json(out.body);
});
// POST /fonti/:id/conferma-codice — schermata 2: salva il codice e lo conferma SUL PORTALE (sincrono).
fontiRouter.post('/:id/conferma-codice', async (req, res) => {
  const codice = (req.body && req.body.codice || '').trim();
  if (!codice) return res.status(400).json({ error: 'Codice obbligatorio.' });
  const store = load();
  const cs = store.__custom || {};
  if (cs[req.params.id]) { cs[req.params.id].codice = enc(codice); cs[req.params.id].codice_ts = Date.now(); save(store); }
  const out = await proxyScraper(req.params.id, store, '/codice?codice=' + encodeURIComponent(codice), 40000);
  return res.status(out.status === 502 ? 502 : 200).json(out.body);
});
// GET /fonti/:id/loginstate — stato del login in corso (il frontend lo POLLA dopo /accedi).
fontiRouter.get('/:id/loginstate', async (req, res) => {
  const store = load();
  const out = await proxyScraper(req.params.id, store, '/loginstate', 8000);
  return res.status(out.status === 502 ? 502 : 200).json(out.body);
});
// POST /fonti/:id/altro-codice — chiede al portale un nuovo OTP via email.
fontiRouter.post('/:id/altro-codice', async (req, res) => {
  const store = load();
  const out = await proxyScraper(req.params.id, store, '/resend', 30000);
  return res.status(out.status === 502 ? 502 : 200).json(out.body);
});

// ── GET /fonti/:id/auto — preventivo auto step 1 + mappa pagina (proxy allo scraper) ─
fontiRouter.get('/:id/auto', async (req, res) => {
  const store = load(); const cf = (store.__custom || {})[req.params.id];
  const surl = cf ? scraperUrlFor(req.params.id, cf.nome, cf) : null;
  if (!surl) return res.status(404).json({ error: 'Nessuno scraper per questo portale.' });
  const q = new URLSearchParams({
    targa: String(req.query.targa || '').toUpperCase().trim(),
    situazione: String(req.query.situazione || ''),
    attestato: String(req.query.attestato || ''),
  }).toString();
  return inoltra(res, surl + '/auto?' + q, 90000);
});

// ── GET /fonti/:id/preventivo — preventivo auto COMPLETO (proxy allo scraper) ─────
fontiRouter.get('/:id/preventivo', async (req, res) => {
  const store = load(); const cf = (store.__custom || {})[req.params.id];
  const surl = cf ? scraperUrlFor(req.params.id, cf.nome, cf) : null;
  if (!surl) return res.status(404).json({ error: 'Nessuno scraper per questo portale.' });
  const keys = ['targa', 'situazione', 'attestato', 'bersani', 'tipoGuida', 'frazionamento', 'massimale', 'dataUltimaVoltura', 'indirizzo', 'salva'];
  const q = new URLSearchParams();
  for (const k of keys) if (req.query[k] != null) q.set(k, String(req.query[k]));
  // ~i 4 step possono richiedere oltre un minuto
  return inoltra(res, surl + '/preventivo?' + q.toString(), 150000);
});

// ── GET /fonti/:id/api — chiamante generico delle azioni interne del portale ──────
fontiRouter.get('/:id/api', async (req, res) => {
  const store = load(); const cf = (store.__custom || {})[req.params.id];
  const surl = cf ? scraperUrlFor(req.params.id, cf.nome, cf) : null;
  if (!surl) return res.status(404).json({ error: 'Nessuno scraper per questo portale.' });
  const q = new URLSearchParams();
  for (const k of Object.keys(req.query)) if (req.query[k] != null && req.query[k] !== '') q.set(k, String(req.query[k]));
  return inoltra(res, surl + '/api?' + q.toString(), 60000);
});

// ── GET /fonti/:id/explore — esplora il portale passo-passo (proxy, generico) ─────
// Strumento generico valido per ogni compagnia: naviga e ritorna struttura pagina + API.
fontiRouter.get('/:id/explore', async (req, res) => {
  const store = load(); const cf = (store.__custom || {})[req.params.id];
  const surl = cf ? scraperUrlFor(req.params.id, cf.nome, cf) : null;
  if (!surl) return res.status(404).json({ error: 'Nessuno scraper per questo portale.' });
  const q = new URLSearchParams();
  for (const k of ['goto', 'click', 'fill', 'enter', 'select', 'cf', 'then', 'grepjs', 'sniff']) if (req.query[k] != null && req.query[k] !== '') q.set(k, String(req.query[k]));
  return inoltra(res, surl + '/explore?' + q.toString(), 90000);
});

// ── GET /fonti/:id/sniff/start|stop — cattura MANUALE delle API (proxy) ───────────
// start = accende la registrazione; stop = ferma e ritorna le chiamate del portale.
// In mezzo l'operatore fa UN preventivo a mano (via VNC) → catturiamo le azioni reali.
fontiRouter.get('/:id/sniff/:azione(start|stop)', async (req, res) => {
  const store = load();
  const surl = anyScraperUrl(req.params.id, store); // built-in (24h/allianz) o custom
  if (!surl) return res.status(404).json({ error: 'Nessuno scraper per questo portale.' });
  return inoltra(res, surl + '/sniff/' + req.params.azione, 30000);
});

// ── GET /fonti/:id/sniff — investigazione API nascoste del portale (proxy) ────────
// Esegue il preventivo con la cattura di rete attiva e ritorna le chiamate XHR/fetch
// interne (lookup targa, calcolo premio/tariffe). Strumento di analisi, non UX.
fontiRouter.get('/:id/sniff', async (req, res) => {
  const store = load(); const cf = (store.__custom || {})[req.params.id];
  const surl = cf ? scraperUrlFor(req.params.id, cf.nome, cf) : null;
  if (!surl) return res.status(404).json({ error: 'Nessuno scraper per questo portale.' });
  const keys = ['targa', 'situazione', 'attestato', 'bersani', 'tipoGuida', 'frazionamento', 'massimale', 'dataUltimaVoltura', 'indirizzo', 'full'];
  const q = new URLSearchParams();
  for (const k of keys) if (req.query[k] != null) q.set(k, String(req.query[k]));
  return inoltra(res, surl + '/sniff?' + q.toString(), 180000);
});

// ── POST /fonti/allianz/cattura — riceve le chiamate API Matrix catturate dal browser dell'utente ──
// Lo script di cattura (console del browser, scheda Matrix) registra le XHR del preventivo; QUOTO le
// invia qui e le salviamo su disco, così possono essere analizzate per costruire il driver.
fontiRouter.post('/allianz/cattura', (req, res) => {
  try {
    const b = req.body || {};
    const dati = b.dati != null ? b.dati : (b.data != null ? b.data : b);
    const txt = typeof dati === 'string' ? dati : JSON.stringify(dati, null, 1);
    if (!txt || txt.trim().length < 5) return res.status(400).json({ error: 'Cattura vuota.' });
    fs.writeFileSync(path.join(__dir, 'allianz-cattura.json'), txt.slice(0, 8000000));
    res.json({ ok: true, bytes: txt.length, salvato: 'server/allianz-cattura.json' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /fonti/allianz/lookup?targa= — interrogazione ANIA (proxy verso lo scraper) ─
fontiRouter.get('/allianz/lookup', async (req, res) => {
  const targa = String(req.query.targa || '').toUpperCase().trim();
  if (!targa) return res.status(400).json({ error: 'Targa mancante.' });
  return inoltra(res, ALLIANZ + '/lookup?targa=' + encodeURIComponent(targa), 60000);
});

// ═══════════════════════════════════════════════════════════════════════════════
//  GET /fonti/salute — diagnosi in chiaro, senza toccare il server via SSH
//
//  PERCHÉ ESISTE
//    Quando una fonte "continua a chiedere il login" le cause possibili sono poche e
//    ben distinte, ma finora per distinguerle bisognava collegarsi al VPS. Qui il
//    backend confronta due punti di vista — cosa c'è salvato nel pannello e cosa dice
//    di vedere lo scraper — e scrive a parole quale dei casi è.
//
//    a) servizio spento          → lo scraper non risponde affatto
//    b) chiave disallineata      → il pannello ha le credenziali, lo scraper dice di
//                                  non averle: sono cifrate con una chiave che lui non
//                                  ha (FONTI_SECRET diverso fra backend e scraper).
//                                  È QUESTA la causa dei re-login infiniti: l'auto-login
//                                  non parte mai, in silenzio.
//    c) credenziali mancanti     → non sono mai state inserite
//    d) sessione scaduta         → tutto a posto, serve solo rifare l'accesso
//
//  NON espone segreti: solo booleani e un'impronta non reversibile della chiave
//  (hash dell'hash), utile solo per confrontarla con quella di un altro processo.
// ═══════════════════════════════════════════════════════════════════════════════
const IMPRONTA_CHIAVE = crypto.createHash('sha256').update(KEY).digest('hex').slice(0, 12);

function diagnosi(cfg, r) {
  const d = r && r.ok ? r.dati : null;
  const haUser = !!cfg.username, haPass = !!cfg.password, haTotpSalvato = !!storedTotp(cfg);
  const out = [];
  if (!r || !r.ok) {
    out.push({ codice: 'scraper_spento', gravita: 'alta',
      messaggio: 'Il servizio di questa compagnia non risponde sul server.',
      // Prima qui c'era scritto "va riavviato il servizio sul VPS": un consiglio
      // inutilizzabile per chi non è un programmatore. Il server ha una guardia che
      // controlla ogni minuto e riaccende da sola i servizi caduti: la cosa giusta da
      // fare è aspettare quel minuto e riprovare, e segnalare solo se non basta.
      cosa_fare: 'Aspetta un minuto e premi di nuovo "Verifica": il server riaccende da solo i servizi caduti. Se dopo 3-4 minuti resta grigia, segnalalo: significa che il servizio non riparte e serve un intervento tecnico.' });
    return out;
  }
  // Confronto fra i due punti di vista: è qui che si smaschera la chiave disallineata.
  if ((haUser || haPass) && d && d.ha_credenziali === false) {
    out.push({ codice: 'chiave_disallineata', gravita: 'alta',
      messaggio: 'Le credenziali sono salvate nel pannello ma il servizio non riesce a leggerle.',
      cosa_fare: 'Backend e scraper usano una chiave di cifratura diversa (FONTI_SECRET): finché non coincidono l\'accesso automatico non parte mai e la fonte richiede il login in continuazione.' });
  }
  if (d && d.totp_illeggibile === true) {
    out.push({ codice: 'totp_illeggibile', gravita: 'alta',
      messaggio: 'Il codice a 6 cifre è salvato ma il servizio non riesce a decifrarlo.',
      cosa_fare: 'Stessa causa di sopra: chiave di cifratura non allineata fra backend e scraper.' });
  }
  if (!haUser && !haPass) {
    out.push({ codice: 'credenziali_mancanti', gravita: 'media',
      messaggio: 'Nessun utente/password salvato per questa fonte.',
      cosa_fare: 'Inserirli dal Pannello Fonti.' });
  } else if (d && d.loggato === false) {
    out.push({ codice: 'sessione_scaduta', gravita: 'bassa',
      messaggio: 'Servizio acceso ma sessione non attiva sul portale.',
      cosa_fare: 'Premere "Verifica": se le credenziali sono leggibili rientra da solo.' });
  }
  if (haTotpSalvato && d && d.ha_totp === false) {
    out.push({ codice: 'totp_non_visto', gravita: 'media',
      messaggio: 'Il segreto del codice a 6 cifre è nel pannello ma il servizio non lo vede.',
      cosa_fare: 'Ricontrollare che il servizio legga lo stesso file credenziali del backend.' });
  }
  return out;
}

fontiRouter.get('/salute', async (req, res) => {
  const store = load();
  const voci = [], meta = [];
  for (const f of FONTI) {
    const surl = anyScraperUrl(f.id, store);
    meta.push({ chiave: 'b:' + f.id, id: f.id, nome: f.nome, surl, cfg: store[f.id] || {} });
    if (surl) voci.push({ id: 'b:' + f.id, surl });
  }
  for (const [id, s] of Object.entries(store.__custom || {})) {
    const surl = scraperUrlFor(id, s.nome, s);
    meta.push({ chiave: 'c:' + id, id, nome: s.nome, surl, cfg: s, spenta: s.attiva === false });
    if (surl && s.attiva !== false) voci.push({ id: 'c:' + id, surl });
  }
  const sonde = await sondaTutte(voci, { forza: req.query.forza === '1' });

  const fonti = meta.map(m => {
    const r = sonde.get(m.chiave);
    const d = r && r.ok ? r.dati : null;
    return {
      id: m.id, nome: m.nome,
      servizio_configurato: !!m.surl,
      porta_locale: m.surl ? (m.surl.split(':').pop() || null) : null,
      spenta_dal_pannello: !!m.spenta,
      raggiungibile: !!(r && r.ok),
      risposta_ms: r ? r.ms : null,
      origine_dato: r ? r.da : 'nessuna_sonda',
      loggato: d ? !!d.loggato : null,
      pagina_corrente: d ? (d.url || null) : null,
      nel_pannello: { utente: !!m.cfg.username, password: !!m.cfg.password, codice_6_cifre: !!storedTotp(m.cfg) },
      visto_dal_servizio: d ? {
        credenziali: d.ha_credenziali != null ? !!d.ha_credenziali : null,
        codice_6_cifre: d.ha_totp != null ? !!d.ha_totp : null,
        codice_illeggibile: d.totp_illeggibile != null ? !!d.totp_illeggibile : null,
        login_in_corso: d.login_running != null ? !!d.login_running : null,
        ultimo_messaggio: d.login_msg || null,
      } : null,
      diagnosi: m.surl ? diagnosi(m.cfg, r) : [{
        codice: 'nessun_servizio', gravita: 'media',
        messaggio: 'Per questa fonte non è configurato nessun servizio di accesso automatico.',
        cosa_fare: 'Indicare la porta dello scraper nella scheda della fonte, oppure lasciarla in sola consultazione.',
      }],
    };
  });

  const problemi = fonti.flatMap(f => f.diagnosi.filter(x => x.gravita === 'alta').map(x => ({ fonte: f.nome || f.id, ...x })));
  res.json({
    ok: true,
    letto_il: new Date().toISOString(),
    riepilogo: {
      totale: fonti.length,
      attive: fonti.filter(f => f.loggato === true).length,
      raggiungibili: fonti.filter(f => f.raggiungibile).length,
      con_problemi_gravi: problemi.length,
    },
    problemi,
    fonti,
    // Impronta NON reversibile della chiave di cifratura del backend: serve solo a
    // confrontarla con quella dello scraper (scraper/diagnosi-fonti.mjs stampa la stessa).
    impronta_chiave_backend: IMPRONTA_CHIAVE,
    interruttori: statoInterruttori(),
  });
});

// ── GET /fonti — elenco fonti con stato (nessun segreto) ───────────────────────
// PRIMA: per ogni fonte una fetch bloccante con 6s di timeout, una dopo l'altra.
//        3 servizi spenti = ~18s di attesa solo per aprire l'elenco (fino a ~50s).
// ORA:   si costruisce prima la lista degli scraper da interrogare, si sondano TUTTI
//        INSIEME, poi si traduce ogni risposta nello stato del pallino. Il tempo totale
//        è quello della sonda più lenta (max 3,5s), non la somma.
fontiRouter.get('/', async (req, res) => {
  const store = load();
  const out = [];

  // 1) Raccolgo gli indirizzi da interrogare (senza chiamare ancora nessuno).
  const voci = [];
  for (const f of FONTI) {
    const surl = anyScraperUrl(f.id, store);
    if (surl) voci.push({ id: 'b:' + f.id, surl });
  }
  const csPre = store.__custom || {};
  for (const [id, s] of Object.entries(csPre)) {
    const surl = scraperUrlFor(id, s.nome, s);
    if (surl && s.attiva !== false) voci.push({ id: 'c:' + id, surl });
  }

  // 2) Una sola andata e ritorno, tutte le sonde in parallelo.
  const sonde = await sondaTutte(voci);

  for (const f of FONTI) {
    const s = store[f.id] || {};
    const base = {
      id: f.id, nome: f.nome, tipo: f.tipo, has2fa: f.has2fa, note: f.note,
      // has_scraper accende gli strumenti di cattura API (Prova/Analizza/Cattura VNC/Esplora) anche
      // per le fonti BUILT-IN (24H→4100, Allianz→4200), non solo per quelle custom.
      has_scraper: !!anyScraperUrl(f.id, store),
      login_guidato: LOGIN_GUIDATO.test((f.id || '') + ' ' + (f.nome || '')), // Accedi+codice dal pannello (come AXA)
      url: s.url || f.url || '',
      configurato: !!(s.username) || f.tipo === 'sessione',
      username: s.username ? maschera(dec(s.username)) : null,
      ha_password: !!s.password,
      ha_totp: !!storedTotp(s),
      codice_in_attesa: !!s.codice && (Date.now() - (s.codice_ts || 0) < 5 * 60 * 1000),
      aggiornato_il: s.aggiornato_il || null,
    };
    const r = sonde.get('b:' + f.id);
    /* `leggibili` = il backend apre davvero le credenziali salvate. Se le apre
       lui e lo scraper no, la chiave dei due processi non e' la stessa. */
    const leggibili = !!(s.username && dec(s.username));
    if (f.id === '24h') Object.assign(base, mappa24h(r));
    else if (f.id === 'allianz') Object.assign(base, mappaAllianz(r, base.configurato, leggibili));
    else if (r) Object.assign(base, mappaScraper(r, base.configurato, leggibili)); // prima e altri con scraper
    else base.stato = base.configurato ? 'da_verificare' : 'non_configurata';
    out.push(base);
  }
  // Portali compagnia aggiunti dal Super Admin (dinamici)
  const cs = store.__custom || {};
  for (const [id, s] of Object.entries(cs)) {
    const surl = scraperUrlFor(id, s.nome, s);
    const base = {
      id, nome: s.nome, url: s.url || '', tipo: 'credenziali', custom: true, has_scraper: !!surl,
      login_guidato: !!surl && LOGIN_GUIDATO.test((id || '') + ' ' + (s.nome || '')),
      has2fa: !!s.has2fa, ruolo: s.ruolo || 'preventivo', note: s.note || '', attiva: s.attiva !== false,
      configurato: !!s.username, username: s.username ? maschera(dec(s.username)) : null,
      ha_password: !!s.password,
      ha_totp: !!storedTotp(s),
      codice_in_attesa: !!s.codice && (Date.now() - (s.codice_ts || 0) < 5 * 60 * 1000),
      aggiornato_il: s.aggiornato_il || null,
      stato: s.attiva === false ? 'spento' : (s.username ? 'da_verificare' : 'non_configurata'),
    };
    const r = sonde.get('c:' + id);
    if (r) Object.assign(base, mappaScraper(r, !!s.username, !!(s.username && dec(s.username))));
    out.push(base);
  }
  res.json({ ok: true, fonti: out });
});

// ── Portali compagnia dinamici (aggiunti dal Super Admin) ──────────────────────
function customStore(store) { if (!store.__custom) store.__custom = {}; return store.__custom; }
function slug(s) { return String(s || 'fonte').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'fonte'; }
const RUOLI_OK = ['targa', 'preventivo', 'entrambi'];

// POST /fonti — crea un nuovo portale compagnia (credenziali cifrate)
fontiRouter.post('/', (req, res) => {
  const { nome, url, username, password, has2fa, ruolo, note } = req.body || {};
  if (!nome || !String(nome).trim()) return res.status(400).json({ error: 'Nome compagnia obbligatorio.' });
  const store = load(); const cs = customStore(store);
  let id = 'c-' + slug(nome), n = 1;
  while (cs[id] || FONTI.find(f => f.id === id)) id = 'c-' + slug(nome) + '-' + (++n);
  cs[id] = {
    nome: String(nome).trim().slice(0, 80), url: String(url || '').trim().slice(0, 300),
    username: username ? enc(String(username).trim()) : '', password: password ? enc(String(password)) : '',
    has2fa: !!has2fa, ruolo: RUOLI_OK.includes(ruolo) ? ruolo : 'preventivo',
    attiva: true, note: String(note || '').slice(0, 300), aggiornato_il: new Date().toISOString(),
  };
  if (!save(store)) return res.status(500).json({ error: 'Salvataggio non riuscito (permessi file).' });
  res.json({ ok: true, id });
});

// PUT /fonti/:id — aggiorna meta e/o credenziali (vuoti = invariati)
fontiRouter.put('/:id', (req, res) => {
  const store = load(); const cs = customStore(store); const s = cs[req.params.id];
  if (!s) return res.status(404).json({ error: 'Portale non trovato.' });
  const { nome, url, username, password, has2fa, ruolo, note, attiva } = req.body || {};
  const totp_secret = incomingTotp(req.body); // accetta totp_secret e alias comuni
  if (nome != null && String(nome).trim()) s.nome = String(nome).trim().slice(0, 80);
  if (url != null) s.url = String(url).trim().slice(0, 300);
  if (username) s.username = enc(String(username).trim());
  if (password) s.password = enc(String(password));
  // Segreto TOTP (Google Authenticator) per il 2° fattore automatico (AXA Guardian, Prima…).
  // Scrivo SEMPRE nel campo canonico `s.totp` (qualunque alias sia arrivato) così lo scraper lo trova.
  if (totp_secret) s.totp = enc(String(totp_secret).replace(/\s+/g, '').toUpperCase());
  // Proxy (residenziale) per aggirare blocchi Cloudflare su IP datacenter (es. Prima). Cifrato.
  if (req.body && req.body.proxy != null) { const pv = String(req.body.proxy).trim(); s.proxy = pv ? enc(pv) : ''; }
  if (has2fa != null) s.has2fa = !!has2fa;
  if (ruolo != null && RUOLI_OK.includes(ruolo)) s.ruolo = ruolo;
  if (note != null) s.note = String(note).slice(0, 300);
  if (attiva != null) s.attiva = !!attiva;
  s.aggiornato_il = new Date().toISOString();
  if (!save(store)) return res.status(500).json({ error: 'Salvataggio non riuscito.' });
  res.json({ ok: true });
});

// DELETE /fonti/:id — elimina un portale compagnia dinamico
fontiRouter.delete('/:id', (req, res) => {
  const store = load(); const cs = customStore(store);
  if (cs[req.params.id]) { delete cs[req.params.id]; save(store); }
  res.json({ ok: true });
});

// ── POST /fonti/:id/credenziali — salva utente/password (cifrati) ──────────────
fontiRouter.post('/:id/credenziali', (req, res) => {
  const f = FONTI.find(x => x.id === req.params.id);
  if (!f) return res.status(404).json({ error: 'Fonte sconosciuta.' });
  const { username, password, url } = req.body || {};
  const totp_secret = incomingTotp(req.body); // accetta totp_secret e alias comuni
  const store = load();
  const s = store[f.id] || {};
  if (!username && !password && !totp_secret && url == null) return res.status(400).json({ error: 'Niente da salvare: inserisci link, utente o password.' });
  if (username) s.username = enc(String(username).trim());
  if (password) s.password = enc(String(password)); // se vuota, mantiene la precedente
  if (totp_secret) s.totp = enc(String(totp_secret).replace(/\s+/g, '').toUpperCase());
  if (url != null) s.url = String(url).trim().slice(0, 300); // link di accesso modificabile
  s.aggiornato_il = new Date().toISOString();
  store[f.id] = s;
  if (!save(store)) return res.status(500).json({ error: 'Salvataggio non riuscito (permessi file).' });
  res.json({ ok: true });
});

// ── DELETE /fonti/:id/credenziali — azzera credenziali ─────────────────────────
fontiRouter.delete('/:id/credenziali', (req, res) => {
  const store = load();
  if (store[req.params.id]) { delete store[req.params.id]; save(store); }
  res.json({ ok: true });
});

// ── POST /fonti/:id/codice — registra il codice 2FA per il prossimo login ──────
fontiRouter.post('/:id/codice', (req, res) => {
  const id = req.params.id;
  const codice = (req.body && req.body.codice || '').trim();
  if (!codice) return res.status(400).json({ error: 'Codice obbligatorio.' });
  const store = load();
  const f = FONTI.find(x => x.id === id);
  if (f) {
    if (!f.has2fa) return res.status(400).json({ error: 'Questa fonte non richiede codice di verifica.' });
    const s = store[f.id] || {};
    s.codice = enc(codice); s.codice_ts = Date.now();
    store[f.id] = s;
  } else if (store.__custom && store.__custom[id]) {
    const s = store.__custom[id];
    s.codice = enc(codice); s.codice_ts = Date.now();
  } else {
    return res.status(404).json({ error: 'Fonte sconosciuta.' });
  }
  if (!save(store)) return res.status(500).json({ error: 'Salvataggio non riuscito.' });
  res.json({ ok: true, valido_per_minuti: 5 });
});

export default fontiRouter;
