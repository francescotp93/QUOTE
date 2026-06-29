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

export const fontiRouter = Router();

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
  const cf = ((store && store.__custom) || {})[id];
  return scraperUrlFor(id, cf && cf.nome, cf);
}
async function statoScraper(surl, configurato) {
  try {
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(surl + '/status', { signal: ctrl.signal }); clearTimeout(to);
    const d = await r.json().catch(() => ({}));
    if (!d || d.url == null) return { stato: configurato ? 'pronta' : 'non_configurata', url: null };
    return { stato: d.loggato ? 'attiva' : (configurato ? 'scaduta' : 'non_configurata'), url: d.url };
  } catch { return { stato: configurato ? 'pronta' : 'non_configurata', url: null }; }
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

// Catalogo fonti. `tipo`: 'sessione' = login persistente (no user/pass nel pannello);
// 'credenziali' = user/password gestiti qui. `has2fa` = richiede codice app.
const FONTI = [
  { id: '24h', nome: '24H Assistance · Moto Platinum', tipo: 'sessione', has2fa: false, url: 'https://www.24hassistance.com', note: 'Login persistente via sessione del browser. Se scade, va rifatto una volta.' },
  { id: 'allianz', nome: 'Allianz', tipo: 'credenziali', has2fa: true, url: 'https://amlogin.allianz.it', note: 'Login con utente/password + codice app. Auto-login in arrivo.' },
];

function load() { try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch { return {}; } }
function save(d) { try { fs.writeFileSync(STORE, JSON.stringify(d, null, 2), { mode: 0o600 }); return true; } catch { return false; } }

// ── Gate: solo Super Admin ─────────────────────────────────────────────────────
fontiRouter.use((req, res, next) => {
  if ((req.user && req.user.email) !== SUPER_ADMIN_EMAIL) return res.status(403).json({ error: 'Riservato al Super Admin.' });
  next();
});

// Stato live della fonte 24H, interrogando lo scraper (telecomando HTTP locale).
async function stato24h() {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(SCRAPER + '/status', { signal: ctrl.signal });
    clearTimeout(to);
    const d = await r.json().catch(() => ({}));
    const url = d && d.url || '';
    if (!url) return { stato: 'spento', url: null };
    const loggato = !/login\.24hassistance/i.test(url);
    return { stato: loggato ? 'attiva' : 'scaduta', url };
  } catch { return { stato: 'spento', url: null }; }
}

// Stato live della fonte Allianz, interrogando il suo scraper (porta 4200).
//  attiva  = scraper su e loggato nel portale  → pallino verde
//  scaduta = scraper su ma non loggato
//  spento  = scraper non raggiungibile
async function statoAllianz(configurato) {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(ALLIANZ + '/status', { signal: ctrl.signal });
    clearTimeout(to);
    const d = await r.json().catch(() => ({}));
    if (!d || !d.url) return { stato: configurato ? 'pronta' : 'non_configurata', url: null };
    return { stato: d.loggato ? 'attiva' : 'scaduta', url: d.url };
  } catch { return { stato: configurato ? 'pronta' : 'non_configurata', url: null }; }
}

// ── POST /fonti/:id/verifica — forza un (auto)login e ritorna lo stato (pallino) ─
fontiRouter.post('/:id/verifica', async (req, res) => {
  const f = FONTI.find(x => x.id === req.params.id);
  // Portale compagnia dinamico con scraper dedicato
  if (!f) {
    const store = load(); const cf = (store.__custom || {})[req.params.id];
    const surl = cf ? scraperUrlFor(req.params.id, cf.nome, cf) : null;
    if (cf && surl) {
      try {
        const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 90000);
        const r = await fetch(surl + '/login', { signal: ctrl.signal }); clearTimeout(to);
        const d = await r.json().catch(() => ({}));
        return res.json({ ok: !!d.ok, stato: d.ok ? 'attiva' : 'scaduta', url: d.url || null });
      } catch { return res.json({ ok: false, stato: 'spento', error: 'Scraper non raggiungibile (servizio in avvio? riprova tra un minuto).' }); }
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
      return res.json({ ok: !!d.ok, stato: d.ok ? 'attiva' : 'scaduta', url: d.url || null });
    } catch { return res.json({ ok: false, stato: 'spento', error: 'Scraper Allianz non raggiungibile (servizio spento?).' }); }
  }
  if (f.id === '24h') { const st = await stato24h(); return res.json({ ok: st.stato === 'attiva', ...st }); }
  return res.json({ ok: false, stato: 'non_configurata' });
});

// ── LOGIN GUIDATO A DUE SCHERMATE (Groupama e simili) ──────────────────────────
// Replica il login del portale dentro QUOTO: 1) Accedi (utente+password → OTP via email),
// 2) Conferma codice (sincrono), 3) Invia altro codice. Niente più cicli in background.
const LOGIN_GUIDATO = /groupama|prima|axa|allianz/i; // compagnie il cui scraper espone /accedi /codice /resend
async function proxyScraper(id, store, scraperPath, timeoutMs) {
  const cf = (store.__custom || {})[id];
  const surl = cf ? scraperUrlFor(id, cf.nome, cf) : anyScraperUrl(id, store);
  if (!surl) return { status: 404, body: { error: 'Nessuno scraper per questo portale.' } };
  try {
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(surl + scraperPath, { signal: ctrl.signal }); clearTimeout(to);
    const d = await r.json().catch(() => ({}));
    return { status: 200, body: d };
  } catch { return { status: 502, body: { error: 'Scraper non raggiungibile (servizio in avvio? riprova tra un minuto).' } }; }
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
  try {
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 90000);
    const r = await fetch(surl + '/auto?' + q, { signal: ctrl.signal }); clearTimeout(to);
    const d = await r.json().catch(() => ({}));
    return res.json(d);
  } catch { return res.status(502).json({ error: 'Scraper non raggiungibile (servizio in avvio?).' }); }
});

// ── GET /fonti/:id/preventivo — preventivo auto COMPLETO (proxy allo scraper) ─────
fontiRouter.get('/:id/preventivo', async (req, res) => {
  const store = load(); const cf = (store.__custom || {})[req.params.id];
  const surl = cf ? scraperUrlFor(req.params.id, cf.nome, cf) : null;
  if (!surl) return res.status(404).json({ error: 'Nessuno scraper per questo portale.' });
  const keys = ['targa', 'situazione', 'attestato', 'bersani', 'tipoGuida', 'frazionamento', 'massimale', 'dataUltimaVoltura', 'indirizzo', 'salva'];
  const q = new URLSearchParams();
  for (const k of keys) if (req.query[k] != null) q.set(k, String(req.query[k]));
  try {
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 150000); // ~i 4 step possono richiedere oltre un minuto
    const r = await fetch(surl + '/preventivo?' + q.toString(), { signal: ctrl.signal }); clearTimeout(to);
    const d = await r.json().catch(() => ({}));
    return res.json(d);
  } catch { return res.status(502).json({ error: 'Scraper non raggiungibile (servizio in avvio?).' }); }
});

// ── GET /fonti/:id/api — chiamante generico delle azioni interne del portale ──────
fontiRouter.get('/:id/api', async (req, res) => {
  const store = load(); const cf = (store.__custom || {})[req.params.id];
  const surl = cf ? scraperUrlFor(req.params.id, cf.nome, cf) : null;
  if (!surl) return res.status(404).json({ error: 'Nessuno scraper per questo portale.' });
  const q = new URLSearchParams();
  for (const k of Object.keys(req.query)) if (req.query[k] != null && req.query[k] !== '') q.set(k, String(req.query[k]));
  try {
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 60000);
    const r = await fetch(surl + '/api?' + q.toString(), { signal: ctrl.signal }); clearTimeout(to);
    const d = await r.json().catch(() => ({}));
    return res.json(d);
  } catch { return res.status(502).json({ error: 'Scraper non raggiungibile (servizio in avvio?).' }); }
});

// ── GET /fonti/:id/explore — esplora il portale passo-passo (proxy, generico) ─────
// Strumento generico valido per ogni compagnia: naviga e ritorna struttura pagina + API.
fontiRouter.get('/:id/explore', async (req, res) => {
  const store = load(); const cf = (store.__custom || {})[req.params.id];
  const surl = cf ? scraperUrlFor(req.params.id, cf.nome, cf) : null;
  if (!surl) return res.status(404).json({ error: 'Nessuno scraper per questo portale.' });
  const q = new URLSearchParams();
  for (const k of ['goto', 'click', 'fill', 'enter', 'select', 'cf', 'then', 'grepjs', 'sniff']) if (req.query[k] != null && req.query[k] !== '') q.set(k, String(req.query[k]));
  try {
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 90000);
    const r = await fetch(surl + '/explore?' + q.toString(), { signal: ctrl.signal }); clearTimeout(to);
    const d = await r.json().catch(() => ({}));
    return res.json(d);
  } catch { return res.status(502).json({ error: 'Scraper non raggiungibile (servizio in avvio?).' }); }
});

// ── GET /fonti/:id/sniff/start|stop — cattura MANUALE delle API (proxy) ───────────
// start = accende la registrazione; stop = ferma e ritorna le chiamate del portale.
// In mezzo l'operatore fa UN preventivo a mano (via VNC) → catturiamo le azioni reali.
fontiRouter.get('/:id/sniff/:azione(start|stop)', async (req, res) => {
  const store = load();
  const surl = anyScraperUrl(req.params.id, store); // built-in (24h/allianz) o custom
  if (!surl) return res.status(404).json({ error: 'Nessuno scraper per questo portale.' });
  try {
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 30000);
    const r = await fetch(surl + '/sniff/' + req.params.azione, { signal: ctrl.signal }); clearTimeout(to);
    const d = await r.json().catch(() => ({}));
    return res.json(d);
  } catch { return res.status(502).json({ error: 'Scraper non raggiungibile (servizio in avvio?).' }); }
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
  try {
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 180000);
    const r = await fetch(surl + '/sniff?' + q.toString(), { signal: ctrl.signal }); clearTimeout(to);
    const d = await r.json().catch(() => ({}));
    return res.json(d);
  } catch { return res.status(502).json({ error: 'Scraper non raggiungibile (servizio in avvio?).' }); }
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
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 60000);
    const r = await fetch(ALLIANZ + '/lookup?targa=' + encodeURIComponent(targa), { signal: ctrl.signal });
    clearTimeout(to);
    const d = await r.json().catch(() => ({}));
    return res.json(d);
  } catch { return res.status(502).json({ error: 'Scraper Allianz non raggiungibile (servizio spento?).' }); }
});

// ── GET /fonti — elenco fonti con stato (nessun segreto) ───────────────────────
fontiRouter.get('/', async (req, res) => {
  const store = load();
  const out = [];
  for (const f of FONTI) {
    const s = store[f.id] || {};
    const base = {
      id: f.id, nome: f.nome, tipo: f.tipo, has2fa: f.has2fa, note: f.note,
      login_guidato: LOGIN_GUIDATO.test((f.id || '') + ' ' + (f.nome || '')), // Accedi+codice dal pannello (come AXA)
      url: s.url || f.url || '',
      configurato: !!(s.username) || f.tipo === 'sessione',
      username: s.username ? maschera(dec(s.username)) : null,
      ha_password: !!s.password,
      ha_totp: !!s.totp,
      codice_in_attesa: !!s.codice && (Date.now() - (s.codice_ts || 0) < 5 * 60 * 1000),
      aggiornato_il: s.aggiornato_il || null,
    };
    if (f.id === '24h') Object.assign(base, await stato24h());
    else if (f.id === 'allianz') Object.assign(base, await statoAllianz(base.configurato));
    else base.stato = base.configurato ? 'pronta' : 'non_configurata';
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
      codice_in_attesa: !!s.codice && (Date.now() - (s.codice_ts || 0) < 5 * 60 * 1000),
      aggiornato_il: s.aggiornato_il || null,
      stato: s.attiva === false ? 'spento' : (s.username ? 'pronta' : 'non_configurata'),
    };
    if (surl && s.attiva !== false) Object.assign(base, await statoScraper(surl, !!s.username));
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
  const { nome, url, username, password, has2fa, ruolo, note, attiva, totp_secret } = req.body || {};
  if (nome != null && String(nome).trim()) s.nome = String(nome).trim().slice(0, 80);
  if (url != null) s.url = String(url).trim().slice(0, 300);
  if (username) s.username = enc(String(username).trim());
  if (password) s.password = enc(String(password));
  // Segreto TOTP (Google Authenticator) per il 2° fattore automatico (es. Prima Assicurazioni).
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
  const { username, password, totp_secret, url } = req.body || {};
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
