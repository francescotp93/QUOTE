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

const SCRAPER = process.env.MOTO_SCRAPER_URL || 'http://127.0.0.1:4100';
const ALLIANZ = process.env.ALLIANZ_SCRAPER_URL || 'http://127.0.0.1:4200';
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
  { id: '24h', nome: '24H Assistance · Moto Platinum', tipo: 'sessione', has2fa: false, note: 'Login persistente via sessione del browser. Se scade, va rifatto una volta.' },
  { id: 'allianz', nome: 'Allianz', tipo: 'credenziali', has2fa: true, note: 'Login con utente/password + codice app. Auto-login in arrivo.' },
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
  if (!f) return res.status(404).json({ error: 'Fonte sconosciuta.' });
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

// ── GET /fonti — elenco fonti con stato (nessun segreto) ───────────────────────
fontiRouter.get('/', async (req, res) => {
  const store = load();
  const out = [];
  for (const f of FONTI) {
    const s = store[f.id] || {};
    const base = {
      id: f.id, nome: f.nome, tipo: f.tipo, has2fa: f.has2fa, note: f.note,
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
  res.json({ ok: true, fonti: out });
});

// ── POST /fonti/:id/credenziali — salva utente/password (cifrati) ──────────────
fontiRouter.post('/:id/credenziali', (req, res) => {
  const f = FONTI.find(x => x.id === req.params.id);
  if (!f) return res.status(404).json({ error: 'Fonte sconosciuta.' });
  if (f.tipo !== 'credenziali') return res.status(400).json({ error: 'Questa fonte usa il login a sessione, non credenziali.' });
  const { username, password, totp_secret } = req.body || {};
  const store = load();
  const s = store[f.id] || {};
  // Utente obbligatorio solo al PRIMO inserimento: in aggiornamento puoi cambiare
  // solo password o solo TOTP lasciando l'utente vuoto (resta quello salvato).
  if (!username && !s.username) return res.status(400).json({ error: 'Username obbligatorio.' });
  if (username) s.username = enc(String(username).trim());
  if (password) s.password = enc(String(password)); // se vuota, mantiene la precedente
  // segreto TOTP (strategia B): se presente lo cifriamo; il valore vuoto lo lascia invariato
  if (totp_secret) s.totp = enc(String(totp_secret).replace(/\s+/g, '').toUpperCase());
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
  const f = FONTI.find(x => x.id === req.params.id);
  if (!f) return res.status(404).json({ error: 'Fonte sconosciuta.' });
  if (!f.has2fa) return res.status(400).json({ error: 'Questa fonte non richiede codice di verifica.' });
  const codice = (req.body && req.body.codice || '').trim();
  if (!codice) return res.status(400).json({ error: 'Codice obbligatorio.' });
  const store = load();
  const s = store[f.id] || {};
  s.codice = enc(codice); s.codice_ts = Date.now();
  store[f.id] = s;
  if (!save(store)) return res.status(500).json({ error: 'Salvataggio non riuscito.' });
  res.json({ ok: true, valido_per_minuti: 5 });
});

export default fontiRouter;
