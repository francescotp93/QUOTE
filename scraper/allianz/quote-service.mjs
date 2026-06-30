// ═══════════════════════════════════════════════════════════════════════════════
//  Allianz — scraper interrogazione ANIA per targa (situazione assicurativa + proprietario)
//  Schema identico al 24H: browser PERSISTENTE su display virtuale + telecomando HTTP.
//
//  - Login SSO su amlogin.allianz.it (utente/password + codice TOTP).
//    Le credenziali e il SEGRETO TOTP arrivano dal Pannello Fonti (server/fonti.store.json,
//    cifrato AES-256-GCM con la stessa chiave FONTI_SECRET del backend).
//    Col segreto TOTP il server genera il codice a 6 cifre da solo → login automatico.
//  - Se l'auto-login non riesce, si fa il login UNA volta via VNC (porta 5901): la
//    sessione resta salvata in ./userdata.
//  - Pagina dati: portaleagenzie.allianz.it/Auto/InquiryAnia/Ricerca.aspx (banca dati ANIA).
//
//  Porta 4200 (il 24H usa 4100). Display :98 (il 24H usa :99).
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

const PORTAL  = 'https://portaleagenzie.allianz.it/matrix/';   // portale agenzie vero (preventivo), NON la banca dati ANIA
const INQUIRY = 'https://portaleagenzie.allianz.it/matrix/';   // landing dopo login (keep-alive)
const LOGIN_URL = 'https://amlogin.allianz.it/nidp/idff/sso?id=6&sid=1&option=credential&sid=1&target=' +
  encodeURIComponent('https://portaleagenzie.allianz.it/matrix/');
const log = (...a) => console.log(new Date().toLocaleTimeString('it-IT'), ...a);

// ── Credenziali dal Pannello Fonti (stessa cifratura del backend) ───────────────
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
function creds() {
  try {
    const store = JSON.parse(fs.readFileSync(STORE, 'utf8'));
    const s = store.allianz || {};
    return { username: dec(s.username), password: dec(s.password), totp: dec(s.totp), codice: s.codice ? dec(s.codice) : '' };
  } catch { return { username: '', password: '', totp: '', codice: '' }; }
}

// ── Generatore TOTP (RFC 6238, SHA-1, 6 cifre, periodo 30s) ─────────────────────
function base32decode(s) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = ''; s = String(s || '').replace(/=+$/,'').replace(/\s+/g,'').toUpperCase();
  for (const c of s) { const v = A.indexOf(c); if (v < 0) continue; bits += v.toString(2).padStart(5, '0'); }
  const bytes = []; for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totpCode(secret, when = Date.now()) {
  if (!secret) return '';
  const key = base32decode(secret);
  let counter = Math.floor(when / 1000 / 30);
  const buf = Buffer.alloc(8);
  for (let i = 7; i >= 0; i--) { buf[i] = counter & 0xff; counter = Math.floor(counter / 256); }
  const h = crypto.createHmac('sha1', key).update(buf).digest();
  const off = h[h.length - 1] & 0xf;
  const code = ((h[off] & 0x7f) << 24) | ((h[off + 1] & 0xff) << 16) | ((h[off + 2] & 0xff) << 8) | (h[off + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}

const ctx = await chromium.launchPersistentContext(userDataDir, {
  headless: false, viewport: null, locale: 'it-IT',
  args: ['--no-sandbox', '--start-maximized', '--disable-blink-features=AutomationControlled'],
});
const page = ctx.pages()[0] || await ctx.newPage();

// ── SNIFFER (come Italiana): registra le chiamate API /matrix/ per ricostruire il flusso preventivo ──
const SNIFF = { on: false, buf: [], max: 4000, t0: 0 };
const SNIFF_SKIP = /\.(js|css|png|jpe?g|gif|svg|woff2?|ttf|ico|map|html)(\?|$)/i;
const sniffOk = (u) => /\/matrix\//i.test(u) && !SNIFF_SKIP.test(u);
ctx.on('request', req => { try { if (!SNIFF.on) return; const u = req.url(); if (!sniffOk(u)) return; let body = ''; try { body = req.postData() || ''; } catch {} if (SNIFF.buf.length < SNIFF.max) SNIFF.buf.push({ kind: 'req', t: Date.now() - SNIFF.t0, method: req.method(), url: u.slice(0, 300), body: String(body).slice(0, 16000) }); } catch {} });
ctx.on('response', async resp => { try { if (!SNIFF.on) return; const req = resp.request(); const u = req.url(); if (!sniffOk(u)) return; const ct = (resp.headers()['content-type'] || '').toLowerCase(); let body = ''; if (/json|text|xml|javascript/.test(ct)) { try { body = await resp.text(); } catch {} } if (SNIFF.buf.length < SNIFF.max) SNIFF.buf.push({ kind: 'res', t: Date.now() - SNIFF.t0, status: resp.status(), method: req.method(), url: u.slice(0, 300), ct, body: String(body).slice(0, 20000) }); } catch {} });
function sniffStart() { SNIFF.on = true; SNIFF.buf = []; SNIFF.t0 = Date.now(); }
function sniffStop() { SNIFF.on = false; return SNIFF.buf.slice(); }
const CATTURA_FILE = path.join(__dir, '../../server/allianz-cattura.json');

// È una pagina di login SSO (amlogin / nidp / Duo) o un errore di sessione?
const isLoginUrl = (url) => /amlogin\.allianz|nidp\/idff|duosecurity|\/login/i.test(url || '');
const onPortal = () => /portaleagenzie\.allianz/i.test(page.url());

async function loggedIn() {
  await page.goto(INQUIRY, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2500);
  if (isLoginUrl(page.url())) return false;
  // se sono sul dominio del portale agenzie e NON c'è un campo password → sessione valida
  if (!/portaleagenzie\.allianz/i.test(page.url())) return false;
  const hasPwd = await page.evaluate(() => !!document.querySelector('input[type=password]')).catch(() => false);
  return !hasPwd;
}

const fillFirst = async (selectors, value) => {
  for (const s of selectors) {
    const el = page.locator(s).first();
    if (await el.count().catch(() => 0)) { try { await el.fill(value, { timeout: 4000 }); return s; } catch {} }
  }
  return null;
};
const submitForm = () => page.evaluate(() => {
  const b = [...document.querySelectorAll('button,input[type=submit],a')].find(x => /accedi|login|entra|conferma|submit|avanti|continua/i.test((x.innerText || x.value || '') + (x.id || '') + (x.name || '')));
  if (b) b.click(); else { const f = document.querySelector('form'); if (f) f.submit(); }
});

// Inserisce un PASSCODE Duo (token generato da Duo Mobile) nel prompt 2FA, gestendo sia
// l'iframe Duo classico sia l'Universal Prompt. Se il campo non è subito visibile, prova
// prima a rivelarlo ("Enter a Passcode" / "Inserisci codice" / "Altre opzioni").
async function enterPasscode(code) {
  const roots = () => [page, ...page.frames()];
  const findInput = async () => {
    for (const root of roots()) {
      const el = root.locator('input[name*="passcode" i], input[id*="passcode" i], input[name*="otp" i], input[name*="code" i], input[autocomplete="one-time-code"], input[type="tel"], input[placeholder*="codice" i], input[placeholder*="passcode" i]').first();
      if ((await el.count().catch(() => 0)) && (await el.isVisible().catch(() => false))) return { el, root };
    }
    return null;
  };
  let f = await findInput();
  if (!f) { // rivela il campo passcode se serve
    for (const root of roots()) {
      const b = root.locator('button:has-text("passcode"), a:has-text("passcode"), button:has-text("codice"), a:has-text("codice"), button:has-text("Other options"), a:has-text("Other options"), button:has-text("Altre opzioni"), a:has-text("Altre opzioni")').first();
      if (await b.count().catch(() => 0)) { await b.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(1200); }
    }
    f = await findInput();
  }
  if (!f) return false;
  await f.el.fill(String(code)).catch(() => {});
  await page.waitForTimeout(300);
  const sub = f.root.locator('button:has-text("Log In"), button:has-text("Accedi"), button:has-text("Verify"), button:has-text("Verifica"), button:has-text("Conferma"), button:has-text("Continua"), input[type=submit]').first();
  if (await sub.count().catch(() => 0)) await sub.click({ timeout: 3000 }).catch(() => {});
  else await f.el.press('Enter').catch(() => {});
  return true;
}

// Auto-login Duo con PASSCODE: mette utente+password da solo, poi inserisce il token
// generato da Duo Mobile (campo "Codice Duo" del pannello). Niente push.
// Il campo password è visibile in pagina (anche dentro iframe)?
async function pwdVisibleAnywhere() {
  for (const root of [page, ...page.frames()]) {
    const el = root.locator('input[type="password"]:visible').first();
    if (await el.count().catch(() => 0)) return root;
  }
  return null;
}
async function autoLogin() {
  const c = creds();
  if (!c.username || !c.password) { log('autoLogin: credenziali assenti nel Pannello Fonti'); return false; }
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1800);
  // ── STEP 1: UTENTE ─────────────────────────────────────────────────────────────
  const okU = await fillFirst(['input[name="Ecom_User_ID"]', 'input#Ecom_User_ID', 'input[name*="user" i]', 'input[name*="username" i]', 'input[name*="login" i]', 'input[type="email"]', 'input[type="text"]', 'input:not([type])'], c.username);
  log('autoLogin step1: utente=', okU);
  if (!okU) { log('autoLogin: campo utente non trovato'); return false; }
  // La password è già in pagina (login a schermata unica) oppure devo AVANZARE alla 2ª schermata?
  let pwdRoot = await pwdVisibleAnywhere();
  if (!pwdRoot) {
    log('autoLogin: niente password in pagina → avanzo (login a due schermate)');
    await submitForm();
    for (let i = 0; i < 14 && !pwdRoot; i++) { await page.waitForTimeout(1000); pwdRoot = await pwdVisibleAnywhere(); }
  }
  if (!pwdRoot) { log('autoLogin: campo password NON comparso dopo l\'utente (url=' + page.url().slice(0, 80) + ')'); return false; }
  // ── STEP 2: PASSWORD ───────────────────────────────────────────────────────────
  let okP = false;
  for (const s of ['input[name="Ecom_Password"]', 'input#Ecom_Password', 'input[name*="pass" i]', 'input[type="password"]']) {
    const el = pwdRoot.locator(s + ':visible').first();
    if (await el.count().catch(() => 0)) { try { await el.fill(c.password, { timeout: 4000 }); okP = true; break; } catch {} }
  }
  log('autoLogin step2: password=', okP);
  if (!okP) return false;
  // submit nello stesso root della password (può essere un iframe)
  await pwdRoot.evaluate(() => { const b = [...document.querySelectorAll('button,input[type=submit],a')].find(x => /accedi|login|entra|conferma|submit|avanti|continua|sign ?in/i.test((x.innerText || x.value || '') + (x.id || '') + (x.name || ''))); if (b) b.click(); else { const f = document.querySelector('form'); if (f) f.submit(); } }).catch(() => {});
  for (let i = 0; i < 8; i++) { await page.waitForTimeout(1000); if (onPortal()) { log('autoLogin: loggato (sessione ricordata, niente 2FA)'); return true; } if (/duosecurity|mfa\.allianz|\/2fa|passcode/i.test(page.url())) break; }
  log('autoLogin: dopo password url=', page.url().slice(0, 90));

  // ── STEP 3: 2FA Duo (PASSCODE da Duo Mobile, salvato nel pannello) ──────────────
  if (!c.codice) { log('autoLogin: arrivato al 2FA Duo, MANCA il codice (inseriscilo nel pannello e premi "Accedi col codice")'); return false; }
  log('autoLogin step3: inserisco il passcode Duo dal pannello...');
  const okC = await enterPasscode(c.codice).catch(e => (log('enterPasscode err:', e.message), false));
  if (!okC) { log('autoLogin: campo passcode Duo non trovato'); return false; }
  for (let i = 0; i < 14; i++) { await page.waitForTimeout(2000); if (onPortal()) { log('autoLogin: passcode accettato → loggato ✅'); return true; } }
  log('autoLogin: passcode non accettato (scaduto/già usato?)');
  return onPortal();
}

async function ensureLogin() {
  if (await loggedIn()) return true;
  log('Non loggato: provo auto-login...');
  if (await autoLogin().catch(e => (log('autoLogin err:', e.message), false))) { log('Auto-login OK'); return true; }
  log('Auto-login non riuscito. Mappa con /otpdump oppure accedi via VNC (127.0.0.1:5901).');
  await page.goto(LOGIN_URL).catch(() => {});
  return false; // il browser resta sulla pagina di login (pronto per VNC); il server HTTP parte subito
}

// ── LOGIN GUIDATO dal pannello (come AXA): /accedi (utente+password fino al Duo) + /codice (passcode Duo) ──
let ALOGIN = { running: false, step: 'idle', since: 0, msg: '' };
const setA = (step, msg, running = false) => { ALOGIN = { running, step, since: Date.now(), msg }; return ALOGIN; };
// Schermata 2FA Duo presente? (campo passcode visibile in un frame, o URL del 2° fattore)
async function duoPasscodeVisible() {
  for (const root of [page, ...page.frames()]) {
    const el = root.locator('input[name*="passcode" i], input[id*="passcode" i], input[autocomplete="one-time-code"], input[type="tel"], input[name*="otp" i], input[name*="code" i]').first();
    if ((await el.count().catch(() => 0)) && (await el.isVisible().catch(() => false))) return true;
  }
  return /duosecurity|mfa\.allianz|\/2fa/i.test(page.url());
}
// FASE 1: utente → password (due schermate). Esito: 'loggato' (device-trust, niente Duo) o 'attesa_otp' (serve il codice).
async function doAccediGuidato() {
  if (ALOGIN.running) return ALOGIN;
  const c = creds();
  if (!c.username || !c.password) return setA('error', 'Credenziali Allianz mancanti nel pannello Fonti.');
  setA('accesso', 'Invio utente e password…', true);
  try {
    await locked(async () => {
      if (await loggedIn()) return setA('loggato', 'Sessione già attiva ✅');
      await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(1800);
      const okU = await fillFirst(['input[name="Ecom_User_ID"]', 'input#Ecom_User_ID', 'input[name*="user" i]', 'input[name*="username" i]', 'input[name*="login" i]', 'input[type="email"]', 'input[type="text"]', 'input:not([type])'], c.username);
      if (!okU) return setA('error', 'Campo utente non trovato sul portale Allianz.');
      let pwdRoot = await pwdVisibleAnywhere();
      if (!pwdRoot) { await submitForm(); for (let i = 0; i < 14 && !pwdRoot; i++) { await page.waitForTimeout(1000); pwdRoot = await pwdVisibleAnywhere(); } }
      if (!pwdRoot) return setA('error', 'La schermata password non è comparsa dopo l\'utente.');
      let okP = false;
      for (const s of ['input[name="Ecom_Password"]', 'input#Ecom_Password', 'input[name*="pass" i]', 'input[type="password"]']) { const el = pwdRoot.locator(s + ':visible').first(); if (await el.count().catch(() => 0)) { try { await el.fill(c.password, { timeout: 4000 }); okP = true; break; } catch {} } }
      if (!okP) return setA('error', 'Campo password non compilabile.');
      await pwdRoot.evaluate(() => { const b = [...document.querySelectorAll('button,input[type=submit],a')].find(x => /accedi|login|entra|conferma|avanti|continua|sign ?in/i.test((x.innerText || x.value || '') + (x.id || '') + (x.name || ''))); if (b) b.click(); else { const f = document.querySelector('form'); if (f) f.submit(); } }).catch(() => {});
      for (let i = 0; i < 15; i++) { await page.waitForTimeout(1000); if (onPortal()) return setA('loggato', 'Login completato ✅ (niente codice: dispositivo ricordato)'); if (await duoPasscodeVisible()) break; }
      if (onPortal()) return setA('loggato', 'Login completato ✅');
      return setA('attesa_otp', 'Apri Duo Mobile, prendi il passcode e inseriscilo qui.');
    });
  } catch (e) { setA('error', 'Errore login: ' + e.message); }
  return ALOGIN;
}
// FASE 2: passcode Duo → portale.
async function doCodiceGuidato(code) {
  code = String(code || '').trim();
  if (!code) return { ok: false, step: ALOGIN.step, msg: 'Codice mancante.' };
  return await locked(async () => {
    setA('invio_otp', 'Inserisco il codice Duo…', true);
    const okC = await enterPasscode(code).catch(e => (log('enterPasscode err:', e.message), false));
    if (!okC) { setA('attesa_otp', 'Campo codice Duo non trovato — riprova.'); return { ok: false, step: 'attesa_otp', msg: 'Campo codice non trovato.' }; }
    for (let i = 0; i < 15; i++) { await page.waitForTimeout(2000); if (onPortal()) { setA('loggato', 'Accesso eseguito ✅'); return { ok: true, loggato: true, step: 'loggato', msg: 'Accesso eseguito ✅' }; } }
    setA('attesa_otp', 'Codice non accettato — genera un nuovo passcode Duo e riprova.');
    return { ok: false, step: 'attesa_otp', msg: 'Codice Duo non accettato. Apri Duo Mobile, prendi un nuovo passcode e riprova.' };
  });
}

let ok = await loggedIn();
if (!ok) ok = await ensureLogin().catch(() => false);
log(ok ? 'LOGGATO: ' + page.url() : 'login non rilevato');

// Dump diagnostico dei controlli di pagina (per tarare i selettori reali).
async function richDump() {
  return page.evaluate(() => {
    const clean = s => (s || '').replace(/\s+/g, ' ').trim().slice(0, 70);
    const sel = 'button,a[role=button],input,select,textarea,[role=combobox],label,table';
    const ctrls = [...document.querySelectorAll(sel)].map(e => ({
      tag: e.tagName.toLowerCase(), id: e.id || null, name: e.getAttribute('name') || null,
      type: e.getAttribute('type') || null, text: clean(e.innerText || e.value),
    })).filter(x => x.id || x.name || (x.text && x.text.length));
    return { url: location.href, title: document.title, text: (document.body.innerText || '').replace(/\n{2,}/g, '\n').slice(0, 3000), ctrls };
  });
}

// Banca Dati ANIA — pagina ASP.NET WebForms (NON il portale /matrix/ del preventivo).
const ANIA_URL = 'https://portaleagenzie.allianz.it/Auto/InquiryAnia/Ricerca.aspx';
// Interrogazione ANIA per targa: compila #ctl00_ContentBody_TextBoxTarga e fa il postback con
// #ctl00_ContentBody_ButtonRicerc. La pagina ricarica con i dati (proprietario, scadenza polizza,
// situazione assicurativa / attestato di rischio). Ritorna il dump grezzo del risultato.
async function cercaTarga(targa) {
  targa = (targa || '').toUpperCase().trim();
  await page.goto(ANIA_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1200);
  // sessione scaduta → rifinita sul login: ritento dopo ensureLogin
  if (!onPortal() || /amlogin\.allianz/i.test(page.url())) {
    await ensureLogin().catch(() => {});
    await page.goto(ANIA_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(1200);
  }
  const filled = await page.evaluate((t) => {
    const tb = document.getElementById('ctl00_ContentBody_TextBoxTarga');
    if (!tb) return false;
    tb.focus(); tb.value = t;
    tb.dispatchEvent(new Event('input', { bubbles: true }));
    tb.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, targa);
  if (!filled) return { filled: false };
  await page.waitForTimeout(400);
  // Il bottone "Cerca" (ctl00_ContentBody_ButtonRicerca) apre il RISULTATO in una NUOVA finestra
  // (target=_blank/window.open). Intercetto la popup e leggo da lì; se invece è un postback in-page
  // resto sulla stessa pagina. Tutto difensivo: non deve mai chiudere/rompere la pagina principale.
  const popupP = ctx.waitForEvent('page', { timeout: 9000 }).catch(() => null);
  const clicked = await page.evaluate(() => {
    const b = document.getElementById('ctl00_ContentBody_ButtonRicerca')
      || [...document.querySelectorAll('input[type=submit],button')].find(x => /^cerca$/i.test((x.value || x.innerText || '').trim()));
    if (b) { b.click(); return true; }
    return false;
  }).catch(() => false);
  const popup = await popupP;
  const target = (popup && !popup.isClosed()) ? popup : page;
  await target.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
  await target.waitForTimeout(2500).catch(() => {});
  const result = await target.evaluate(() => {
    const tables = [...document.querySelectorAll('table')]
      .map(t => (t.innerText || '').replace(/\s+/g, ' ').trim())
      .filter(t => t.length > 8).slice(0, 10);
    return { url: location.href, title: document.title, text: (document.body.innerText || '').replace(/\n{2,}/g, '\n').slice(0, 5000), tables };
  }).catch(e => ({ error: e.message }));
  // chiudo la popup del risultato per non accumulare finestre (la pagina principale resta viva)
  if (popup && !popup.isClosed() && popup !== page) { await popup.close().catch(() => {}); }
  return { filled: true, clicked, popup: !!popup, result };
}

// Serializza le operazioni sulla pagina: keep-alive e richieste non si sovrappongono.
let CHAIN = Promise.resolve();
function locked(fn) { const run = CHAIN.then(fn, fn); CHAIN = run.then(() => {}, () => {}); return run; }
// Pausa della keep-alive: durante un login MANUALE via VNC la keep-alive NON deve ricaricare la
// pagina (butterebbe fuori l'utente). /pausakeepalive?min=N sospende il keep-alive per N minuti.
let PAUSE_KA_UNTIL = 0;

http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const u = new URL(req.url, 'http://x');
    if (u.pathname.startsWith('/status')) {
      const c = creds();
      return res.end(JSON.stringify({ url: page.url(), loggato: onPortal(), ha_credenziali: !!(c.username && c.password), ha_totp: !!c.totp }));
    }
    // /loginstate PRIMA di /login (il polling dello stato non deve riavviare il login)
    if (u.pathname.startsWith('/loginstate')) { return res.end(JSON.stringify(ALOGIN)); }
    if (u.pathname === '/accedi') { // FASE 1 guidata: utente+password fino al Duo (non bloccante; il pannello polla /loginstate)
      PAUSE_KA_UNTIL = Date.now() + 10 * 60 * 1000; // niente keep-alive mentre l'utente completa il login dal pannello
      doAccediGuidato(); await new Promise(r => setTimeout(r, 400));
      return res.end(JSON.stringify({ ok: ALOGIN.step === 'loggato' || ALOGIN.step === 'attesa_otp', ...ALOGIN }));
    }
    if (u.pathname === '/codice') { // FASE 2 guidata: passcode Duo dal pannello
      const codice = (u.searchParams.get('codice') || creds().codice || '').trim();
      return res.end(JSON.stringify(await doCodiceGuidato(codice)));
    }
    if (u.pathname === '/resend') { return res.end(JSON.stringify({ ok: false, msg: 'Per Allianz il codice lo genera Duo Mobile: apri l\'app, prendi il passcode e premi Conferma.' })); }
    if (u.pathname.startsWith('/pausakeepalive')) { // sospende la keep-alive per il login manuale via VNC
      const min = Math.min(60, Math.max(1, parseInt(u.searchParams.get('min') || '20', 10) || 20));
      PAUSE_KA_UNTIL = Date.now() + min * 60 * 1000;
      return res.end(JSON.stringify({ ok: true, pausa_minuti: min, fino_a: new Date(PAUSE_KA_UNTIL).toLocaleTimeString('it-IT') }));
    }
    if (u.pathname.startsWith('/login')) { // forza un tentativo di (auto)login
      const done = await locked(() => ensureLogin().catch(e => (log('login err:', e.message), false)));
      await page.screenshot({ path: 'shots/login.png', fullPage: true }).catch(() => {});
      return res.end(JSON.stringify({ ok: done, url: page.url() }));
    }
    if (u.pathname.startsWith('/logindump')) { // mappa la pagina di login (per tarare autoLogin)
      const out = await locked(async () => {
        await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
        await page.waitForTimeout(1500);
        await page.screenshot({ path: 'shots/logindump.png', fullPage: true }).catch(() => {});
        return richDump();
      });
      return res.end(JSON.stringify(out, null, 2));
    }
    if (u.pathname.startsWith('/otpdump')) { // fa user+password e mostra la pagina del codice
      const out = await locked(async () => {
        const c = creds();
        await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
        await page.waitForTimeout(1500);
        await fillFirst(['input[name="Ecom_User_ID"]', 'input[name*="user" i]', 'input[type=text]'], c.username);
        await fillFirst(['input[name="Ecom_Password"]', 'input[type=password]'], c.password);
        const before = page.url();
        await submitForm();
        await page.waitForTimeout(4500);
        await page.screenshot({ path: 'shots/otpdump.png', fullPage: true }).catch(() => {});
        return { before, after: page.url(), dump: await richDump() };
      });
      return res.end(JSON.stringify(out, null, 2));
    }
    if (u.pathname.startsWith('/lookup')) { // interrogazione ANIA per targa (+ dump per mappatura)
      const targa = (u.searchParams.get('targa') || '').toUpperCase().trim();
      if (!targa) return res.end(JSON.stringify({ error: 'Uso: /lookup?targa=AB12345' }));
      const out = await locked(async () => {
        if (!onPortal() && !(await ensureLogin().catch(() => false)))
          return { error: 'Non loggato ad Allianz: premi "Verifica accesso" e approva la notifica Duo sul telefono.' };
        log('Interrogazione ANIA targa:', targa);
        const r = await cercaTarga(targa);
        return { ok: true, targa, campo_targa_compilato: !!(r && r.filled), submit: !!(r && r.clicked), popup: !!(r && r.popup), risultato: (r && r.result) || null };
      });
      return res.end(JSON.stringify(out, null, 2));
    }
    if (u.pathname.startsWith('/sniff/start')) { sniffStart(); return res.end(JSON.stringify({ ok: true, sniffing: true })); }
    if (u.pathname.startsWith('/sniff/stop')) {
      const buf = sniffStop();
      try { fs.writeFileSync(CATTURA_FILE, JSON.stringify(buf, null, 1)); } catch (e) {}
      const calls = buf.filter(e => e.kind === 'res').map(e => ({ status: e.status, url: e.url }));
      return res.end(JSON.stringify({ ok: true, totali: buf.length, salvato: CATTURA_FILE, chiamate: calls.slice(0, 60) }, null, 2));
    }
    if (u.pathname.startsWith('/explore')) {
      // ESPLORAZIONE iframe-aware del portale SPA /matrix/: opzionale ?goto=<url|hash>, poi enumera
      // TUTTI i frame (url + voci di menu/link/bottoni/campi) per mappare il flusso preventivo.
      const out = await locked(async () => {
        const g = u.searchParams.get('goto');
        if (g) { const dst = /^https?:/i.test(g) ? g : (PORTAL.replace(/\/$/, '') + (g.startsWith('/') ? g : '/' + g)); await page.goto(dst, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}); }
        // TYPE: scrive in un campo (selettore esplicito, barra di ricerca, o primo input visibile).
        // pressSequentially (carattere per carattere) perché Angular/nx-input reagisce agli eventi input.
        const type = u.searchParams.get('type');
        if (type != null) {
          const selp = u.searchParams.get('sel') || 'input#main-search-input, input[type=search], input[placeholder*=cerca i], input[aria-label*=cerca i], nx-search input, input[type=text]:visible, input:visible';
          for (const fr of [page.mainFrame(), ...page.frames()]) {
            let inp = fr.locator(selp).first();
            if (!(await inp.count().catch(() => 0))) inp = fr.locator('input:visible').first();
            if (await inp.count().catch(() => 0)) { try { await inp.click({ timeout: 3000 }).catch(() => {}); await inp.fill('').catch(() => {}); await inp.pressSequentially(type, { delay: 70, timeout: 9000 }); await page.waitForTimeout(1500); if (u.searchParams.get('enter') === '1') await inp.press('Enter'); break; } catch (e) {} }
          }
        }
        const click = u.searchParams.get('click');
        if (click) { for (const fr of [page.mainFrame(), ...page.frames()]) { const b = fr.locator(`a:has-text("${click}"), button:has-text("${click}"), [role=menuitem]:has-text("${click}"), [role=button]:has-text("${click}")`).first(); if (await b.count().catch(() => 0)) { await b.click({ timeout: 4000 }).catch(() => {}); break; } } }
        await page.waitForTimeout(parseInt(u.searchParams.get('wait') || '3000', 10) || 3000);
        const frames = [];
        for (const fr of [page.mainFrame(), ...page.frames()]) {
          const info = await fr.evaluate(() => {
            const vis = e => e && e.offsetParent !== null;
            const clean = s => (s || '').replace(/\s+/g, ' ').trim().slice(0, 55);
            const links = [...document.querySelectorAll('a,[role=menuitem],[role=tab],button')].filter(vis).map(e => clean(e.innerText || e.value || e.getAttribute('aria-label'))).filter(t => t && t.length > 1);
            const fields = [...document.querySelectorAll('input,select,textarea')].filter(vis).map(e => ({ tag: e.tagName.toLowerCase(), type: e.getAttribute('type') || '', id: (e.id || '').slice(0, 30), name: (e.getAttribute('name') || '').slice(0, 30), ph: (e.getAttribute('placeholder') || '').slice(0, 30) }));
            return { url: location.href.slice(0, 120), title: document.title, nlinks: links.length, links: [...new Set(links)].slice(0, 40), fields: fields.slice(0, 25), bodylen: (document.body && document.body.innerText || '').length };
          }).catch(() => null);
          if (info) frames.push(info);
        }
        return { url: page.url(), nframes: frames.length, frames };
      });
      return res.end(JSON.stringify(out, null, 2));
    }
    if (u.pathname.startsWith('/shot')) { await page.screenshot({ path: 'shots/current.png', fullPage: true }).catch(() => {}); return res.end(JSON.stringify({ ok: true, url: page.url() })); }
    res.end(JSON.stringify({ endpoints: ['/status', '/login', '/logindump', '/otpdump', '/lookup?targa=..', '/explore?goto=&click=&wait=', '/shot'] }));
  } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e) })); }
}).listen(4200, '127.0.0.1', () => log('Telecomando HTTP Allianz su 127.0.0.1:4200'));

// Keep-alive "umano": ogni ~3 min naviga nel portale e simula attività (mouse + scroll)
// così la sessione non va MAI in timeout per inattività. Se la trova caduta, prova un
// ri-login silenzioso (riesce senza Duo finché il cookie SSO è ancora valido).
async function keepAlive() {
  if (Date.now() < PAUSE_KA_UNTIL) { log('[keep-alive] in pausa (login dal pannello in corso)'); return; }
  if (ALOGIN.running || ALOGIN.step === 'attesa_otp') return; // login guidato in corso: non navigare via
  await locked(async () => {
    try {
      const dest = Math.random() < 0.5 ? PORTAL : INQUIRY;
      await page.goto(dest, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.mouse.move(150 + Math.random() * 500, 150 + Math.random() * 350).catch(() => {});
      await page.evaluate(() => { window.scrollBy(0, 140); setTimeout(() => window.scrollTo(0, 0), 300); }).catch(() => {});
      await page.waitForTimeout(500);
      if (isLoginUrl(page.url())) {
        log('[keep-alive] sessione caduta → ri-login silenzioso...');
        const ok = await autoLogin().catch(() => false);
        log('[keep-alive] ri-login', ok ? 'OK' : 'fallito (serve approvazione Duo)');
      } else log('[keep-alive] attività ok →', page.url());
    } catch (e) { log('[keep-alive] err:', e.message); }
  });
}
setInterval(keepAlive, 3 * 60 * 1000);
log('=== SERVIZIO ALLIANZ ATTIVO (v2 · login Duo col codice) ===');
await new Promise(() => {});
