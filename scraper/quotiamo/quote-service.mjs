// ═══════════════════════════════════════════════════════════════════════════════
//  Quotiamo — scraper "PORTALE PROPRIO" (comparatore esterno a Plurima).
//  Clonato da scraper/_template (vedi docs/ARCHITETTURA-MULTICOMPAGNIA.md §3b/§5).
//  Stesso schema di scraper/italiana e scraper/allianz: browser PERSISTENTE +
//  telecomando HTTP su porta dedicata + credenziali dal Pannello Fonti.
//
//  Login generico già pronto; gli ADAPTER (recuperaVeicolo/recuperaAnagrafica/
//  calcolaPremio) sono da mappare LIVE con /explore + /sniff sul portale reale.
//  Endpoint standard mantenuti: /status /login /hub /hubveicolo /preventivo.
// ═══════════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const userDataDir = path.join(__dir, 'userdata');
const STORE = process.env.FONTI_STORE || path.join(__dir, '../../server/fonti.store.json');

// Identità della fonte e del servizio (Quotiamo)
const FONTE_ID    = process.env.FONTE_ID || 'c-quotiamo';      // id nel Pannello Fonti (__custom)
const FONTE_MATCH = /quotiam/i;                                // fallback di match sul nome fonte
// TODO[ADAPTER] confermare l'URL reale di login dal Pannello Fonti (campo url della fonte).
const DEFAULT_LOGIN = 'https://www.quotiamo.it/login';
const PORT    = Number(process.env.PORT || 5000);             // Quotiamo: 5000 / DISPLAY :90 / VNC 5909
const NOME    = 'Quotiamo';
const log = (...a) => console.log(new Date().toLocaleTimeString('it-IT'), '[quotiamo]', ...a);

// ── Credenziali dal Pannello Fonti (stessa cifratura del backend, NON modificare) ──
const SECRET = process.env.FONTI_SECRET || ('withus-fonti-' + (process.env.HOSTNAME || 'vps') + '-v1');
const KEY = crypto.createHash('sha256').update(SECRET).digest();
function dec(blob) {
  if (!blob || !String(blob).startsWith('v1:')) return '';
  try {
    const raw = Buffer.from(String(blob).slice(3), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', KEY, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch { return ''; }
}
function getFonte(store) {
  const cs = (store && store.__custom) || {};
  if (cs[FONTE_ID]) return cs[FONTE_ID];
  for (const k of Object.keys(cs)) if (FONTE_MATCH.test(cs[k].nome || '')) return cs[k];
  return {};
}
function creds() {
  try {
    const store = JSON.parse(fs.readFileSync(STORE, 'utf8'));
    const s = getFonte(store);
    return {
      username: dec(s.username), password: dec(s.password),
      totp: s.totp ? dec(s.totp) : '', codice: s.codice ? dec(s.codice) : '',
      loginUrl: (s.url && String(s.url).trim()) || DEFAULT_LOGIN,
    };
  } catch { return { username: '', password: '', totp: '', codice: '', loginUrl: DEFAULT_LOGIN }; }
}
const origin = (u) => { try { return new URL(u).origin; } catch { return DEFAULT_LOGIN; } };

const ctx = await chromium.launchPersistentContext(userDataDir, {
  headless: false, viewport: null, locale: 'it-IT',
  args: ['--no-sandbox', '--start-maximized', '--disable-blink-features=AutomationControlled'],
});
const page = ctx.pages()[0] || await ctx.newPage();
page.on('dialog', d => d.accept().catch(() => {}));

let CHAIN = Promise.resolve();
function locked(fn) { const run = CHAIN.then(fn, fn); CHAIN = run.then(() => {}, () => {}); return run; }

// ── Login / sessione ────────────────────────────────────────────────────────────
const isLoginUrl = (url) => /login|signin|accedi|auth|sso/i.test(url || '');
async function hasPasswordField() { return page.evaluate(() => !!document.querySelector('input[type=password]')).catch(() => false); }
async function loggedIn() {
  await page.goto(origin(creds().loginUrl), { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2000);
  return !isLoginUrl(page.url()) && !(await hasPasswordField());
}
async function autoLogin() {
  const c = creds();
  if (!c.username || !c.password) { log('credenziali assenti nel Pannello Fonti'); return false; }
  await page.goto(c.loginUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1500);
  // Login generico: compila utente/password nel form della password e invia.
  // TODO[ADAPTER] affinare i selettori se il portale Quotiamo ha un form particolare.
  await page.evaluate(({ u, p }) => {
    const pwd = [...document.querySelectorAll('input[type=password]')].find(e => e.offsetParent);
    if (!pwd) return;
    const form = pwd.closest('form') || document;
    const user = [...form.querySelectorAll('input')].find(e => e !== pwd && e.offsetParent && !['hidden','submit','button','password','checkbox','radio'].includes((e.type||'text').toLowerCase()));
    const set = (el, v) => { el.focus(); el.value = v; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); };
    if (user) set(user, u); set(pwd, p);
    const b = [...form.querySelectorAll('button,input[type=submit],a')].find(x => /accedi|login|entra|sign ?in/i.test((x.innerText||x.value||'')));
    if (b) b.click(); else if (form.submit) form.submit();
  }, { u: c.username, p: c.password }).catch(() => {});
  await page.waitForTimeout(4000);
  // TODO[ADAPTER] gestire 2FA se presente: TOTP (vedi allianz) o passcode/OTP (vedi italiana enterPasscode)
  return !isLoginUrl(page.url()) && !(await hasPasswordField());
}
async function ensureLogin() {
  if (await loggedIn()) return true;
  if (await autoLogin().catch(() => false)) return true;
  log('Auto-login non riuscito: accedi UNA volta via VNC (127.0.0.1:5909).');
  return false;
}

// ── ADAPTER: produce i formati NORM (vedi doc §2.3). TODO[ADAPTER] da mappare LIVE. ──
async function recuperaVeicolo(targa, situazione = 'Rinnovo', opts = {}) {
  await ensureLogin();
  // TODO[ADAPTER] interroga la banca dati targa di Quotiamo (usa /explore e /sniff per scoprire come).
  return { ok: false, error: 'recuperaVeicolo non implementato', targa, situazione };
}
async function recuperaAnagrafica(cf) {
  await ensureLogin();
  // TODO[ADAPTER] -> AnagraficaNorm (se il portale lo permette; altrimenti capabilities.anagrafica=false)
  return { ok: false, error: 'recuperaAnagrafica non implementato', cf };
}
async function calcolaPremio(dati = {}, garanzie = []) {
  await ensureLogin();
  // TODO[ADAPTER] payload nativo di Quotiamo dai dati recuperati -> PremioNorm
  return { ok: false, error: 'calcolaPremio non implementato' };
}

// ── Telecomando HTTP (endpoint standard: NON rinominare) ──────────────────────────
http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const u = new URL(req.url, 'http://x');
    const g = k => u.searchParams.get(k) || '';
    if (u.pathname.startsWith('/status')) {
      const c = creds();
      return res.end(JSON.stringify({ url: page.url(), loggato: !isLoginUrl(page.url()) && !(await hasPasswordField()), ha_credenziali: !!(c.username && c.password) }));
    }
    if (u.pathname.startsWith('/login')) {
      const ok = await locked(() => ensureLogin().catch(() => false));
      return res.end(JSON.stringify({ ok, url: page.url() }));
    }
    if (u.pathname.startsWith('/hubveicolo')) {
      const out = await locked(() => recuperaVeicolo(g('targa').toUpperCase().trim(), g('situazione') || 'Rinnovo', { bersaniTarga: g('bersani') }));
      return res.end(JSON.stringify(out, null, 2));
    }
    if (u.pathname.startsWith('/hub')) {
      const out = await locked(async () => ({ targa: g('targa'), cf: g('cf'),
        anagrafica: g('cf') ? await recuperaAnagrafica(g('cf').toUpperCase().trim()) : null }));
      return res.end(JSON.stringify(out, null, 2));
    }
    if (u.pathname.startsWith('/preventivo')) {
      const out = await locked(() => calcolaPremio({ targa: g('targa'), situazione: g('situazione'), massimale: g('massimale'), frazionamento: g('frazionamento') }, (g('garanzie') || '').split(',').filter(Boolean)));
      return res.end(JSON.stringify(out, null, 2));
    }
    // /explore /sniff -> da copiare dagli strumenti generici di scraper/italiana in fase di mappatura.
    return res.end(JSON.stringify({ endpoints: ['/status', '/login', '/hub', '/hubveicolo', '/preventivo', '/explore', '/sniff'] }));
  } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e) })); }
}).listen(PORT, '127.0.0.1', () => log('Telecomando HTTP ' + NOME + ' su 127.0.0.1:' + PORT));

setInterval(() => locked(() => loggedIn().then(ok => { if (!ok) autoLogin().catch(() => {}); })), 3 * 60 * 1000);
log('=== SERVIZIO ' + NOME + ' ATTIVO (da template) ===');
await new Promise(() => {});
