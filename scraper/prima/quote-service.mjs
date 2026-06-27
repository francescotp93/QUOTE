// ─────────────────────────────────────────────────────────────────────────────
//  Prima Assicurazioni — scraper portale (login con secondo fattore TOTP).
//  Porta 4600, display :94, VNC 5905. Credenziali dal Pannello Fonti (fonte c-prima).
//  2FA: dopo utente+password il portale chiede un codice TOTP (Google Authenticator).
//  Il SEGRETO base32 è salvato in QUOTO > Fonti > Prima (campo s.totp, cifrato); qui lo
//  decifriamo e GENERIAMO il codice DA SOLI ad ogni login (RFC 6238, solo modulo crypto),
//  poi lo inseriamo sulla pagina 2FA. Se il segreto manca, fallback al polling del campo
//  `codice` da Fonti (come Groupama). La sessione resta persistente (userdata su disco) così
//  il 2FA non va reinserito ad ogni preventivo.
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright';
import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const userDataDir = path.join(__dir, 'userdata');
const STORE = process.env.FONTI_STORE || path.join(__dir, '../../server/fonti.store.json');
const FONTE_ID = process.env.FONTE_ID || 'c-prima';
const DEFAULT_LOGIN = 'https://www.prima.it/';
const PORT = parseInt(process.env.PORT || '4600', 10);
const log = (...a) => console.log(new Date().toLocaleTimeString('it-IT'), '[prima]', ...a);

// ── Credenziali dal Pannello Fonti (stessa cifratura AES-256-GCM del backend) ───
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
function rawFonte() {
  try {
    const store = JSON.parse(fs.readFileSync(STORE, 'utf8'));
    const cs = (store && store.__custom) || {};
    if (cs[FONTE_ID]) return cs[FONTE_ID];
    for (const k of Object.keys(cs)) if (/prima/i.test(cs[k].nome || '')) return cs[k];
    return {};
  } catch { return {}; }
}
function creds() {
  const s = rawFonte();
  return {
    username: dec(s.username), password: dec(s.password),
    totpSecret: s.totp ? dec(s.totp) : '',
    codice: s.codice ? dec(s.codice) : '', codice_ts: s.codice_ts || 0,
    loginUrl: (s.url && String(s.url).trim()) || DEFAULT_LOGIN,
  };
}
const origin = (u) => { try { return new URL(u).origin; } catch { return 'https://www.prima.it'; } };

// ── TOTP (RFC 6238) — generato in proprio col solo modulo crypto, niente dipendenze ──
function base32Decode(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = String(secret || '').replace(/\s+/g, '').replace(/=+$/g, '').toUpperCase();
  let bits = '';
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) continue; // ignora caratteri non base32
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
// Genera il codice a 6 cifre per il contatore corrente (offset = numero di finestre da 30s rispetto a ora).
function totpAt(secretBase32, offset = 0) {
  const key = base32Decode(secretBase32);
  if (!key.length) return '';
  let counter = Math.floor(Date.now() / 1000 / 30) + offset;
  const buf = Buffer.alloc(8);
  for (let i = 7; i >= 0; i--) { buf[i] = counter & 0xff; counter = Math.floor(counter / 256); }
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const off = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[off] & 0x7f) << 24) | ((hmac[off + 1] & 0xff) << 16) | ((hmac[off + 2] & 0xff) << 8) | (hmac[off + 3] & 0xff);
  return String(bin % 1000000).padStart(6, '0');
}
const totpNow = (s) => totpAt(s, 0);
// Lista di codici da provare in ordine: finestra corrente, poi precedente e successiva (tolleranza clock).
const totpCandidates = (s) => [totpAt(s, 0), totpAt(s, -1), totpAt(s, 1)].filter(Boolean);

// ── Browser persistente (sessione su disco → 2FA non si reinserisce ad ogni avvio) ──
async function launchCtx() {
  for (const f of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) { try { fs.rmSync(userDataDir + '/' + f, { force: true }); } catch {} }
  return chromium.launchPersistentContext(userDataDir, {
    headless: false, viewport: null, locale: 'it-IT',
    args: ['--no-sandbox', '--start-maximized', '--disable-blink-features=AutomationControlled'],
  });
}
let ctx = await launchCtx();
let page = ctx.pages()[0] || await ctx.newPage();

// ── SNIFF (per mappare in seguito il preventivatore Prima) ──────────────────────
const SNIFF = { on: false, buf: [], max: 1500, t0: 0 };
const NOISE = /googletagmanager|google-analytics|googleapis|gstatic|recaptcha|doubleclick|hotjar|facebook|fbcdn|cloudflare|cdn|\.(png|jpe?g|gif|svg|css|woff2?|ttf|ico|map)(\?|$)/i;
function wireSniff(c) {
  c.on('request', req => { try { if (!SNIFF.on) return; const url = req.url(); const ty = req.resourceType(); if (NOISE.test(url) || !(ty === 'xhr' || ty === 'fetch' || ty === 'document')) return; let body = ''; try { body = req.postData() || ''; } catch {} if (SNIFF.buf.length < SNIFF.max) SNIFF.buf.push({ kind: 'req', t: Date.now() - SNIFF.t0, method: req.method(), url, body: String(body).slice(0, 3000) }); } catch {} });
  c.on('response', async resp => { try { if (!SNIFF.on) return; const req = resp.request(); const url = req.url(); const ty = req.resourceType(); if (NOISE.test(url) || !(ty === 'xhr' || ty === 'fetch' || ty === 'document')) return; const ct = (resp.headers()['content-type'] || '').toLowerCase(); let body = ''; if (/json|text|html/.test(ct)) { try { body = await resp.text(); } catch {} } if (SNIFF.buf.length < SNIFF.max) SNIFF.buf.push({ kind: 'res', t: Date.now() - SNIFF.t0, status: resp.status(), method: req.method(), url, body: String(body).slice(0, 20000) }); } catch {} });
}
wireSniff(ctx);
function sniffStart() { SNIFF.on = true; SNIFF.buf = []; SNIFF.t0 = Date.now(); }
function sniffStop() { SNIFF.on = false; return SNIFF.buf.slice(); }

async function ensurePage() {
  let closed = true;
  try { closed = !page || page.isClosed(); } catch { closed = true; }
  if (!closed) return;
  log('[recovery] pagina chiusa → la ricreo');
  try { page = ctx.pages().find(p => { try { return !p.isClosed(); } catch { return false; } }) || await ctx.newPage(); }
  catch (e) { log('[recovery] contesto morto → rilancio:', e.message); try { await ctx.close().catch(() => {}); } catch {} ctx = await launchCtx(); wireSniff(ctx); page = ctx.pages()[0] || await ctx.newPage(); }
}

const isLoginUrl = (url) => /login|signin|accedi|auth|sso|mfa|totp|verify|2fa/i.test(url || '');
async function hasPasswordField() { return await page.$('input[type=password]').then(e => !!e).catch(() => false); }
// Pagina 2FA = c'è un campo per il codice (testo/number/tel) e NON c'è la password,
// oppure l'URL è quello del secondo fattore (/auth|/mfa|/totp|/verify|/2fa).
async function otpField() {
  const isMfaUrl = /\/auth|\/mfa|\/totp|\/verify|\/2fa/i.test(page.url());
  return await page.evaluate((isMfaUrl) => {
    const vis = e => e && e.offsetParent !== null;
    if ([...document.querySelectorAll('input[type=password]')].some(vis)) return false;
    const cand = [...document.querySelectorAll('input[type=text],input[type=tel],input[type=number],input:not([type])')].filter(vis);
    const looksOtp = e => /otp|codice|token|verif|pin|sicurezza|one.?time|passcode|authenticator|2fa|mfa|totp/i.test((e.name || '') + ' ' + (e.id || '') + ' ' + (e.placeholder || '') + ' ' + ((e.closest('form,div,label') || {}).innerText || ''));
    let e = cand.find(looksOtp);
    if (!e && isMfaUrl && cand.length) e = cand[0]; // sulla pagina 2FA basta il campo testo visibile
    if (!e && cand.length === 1) e = cand[0];
    return e ? (e.id || e.name || 'OTP') : false;
  }, isMfaUrl).catch(() => false);
}

async function loggedIn() {
  await ensurePage();
  const c = creds();
  await page.goto(c.loginUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(3000);
  if (isLoginUrl(page.url())) return false;
  if (await hasPasswordField()) return false;
  if (await otpField()) return false;
  return true;
}

// Compila utente+password e invia. Ritorna true se il form è stato compilato.
async function fillUserPass(u, p) {
  return await page.evaluate(({ u, p }) => {
    const vis = e => e && e.offsetParent !== null;
    const pwd = [...document.querySelectorAll('input[type=password]')].find(vis);
    if (!pwd) return { ok: false, reason: 'password assente' };
    const form = pwd.closest('form') || document;
    const skip = ['hidden', 'checkbox', 'radio', 'submit', 'button', 'password'];
    const user = [...form.querySelectorAll('input')].find(e => e !== pwd && vis(e) && !skip.includes((e.type || 'text').toLowerCase()));
    const set = (el, val) => { el.focus(); el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    if (user) set(user, u);
    set(pwd, p);
    return { ok: !!user };
  }, { u, p }).catch(e => ({ ok: false, reason: e.message }));
}
async function clickSubmit() {
  await page.evaluate(() => {
    const vis = e => e && e.offsetParent !== null;
    const all = [...document.querySelectorAll('button,input[type=submit],a[role=button],a')].filter(vis);
    const b = all.find(x => /accedi|login|entra|conferma|prosegui|continua|invia|verifica|avanti|sign ?in/i.test((x.innerText || x.value || '')));
    if (b) b.click();
  }).catch(() => {});
}
// Inserisce un codice nel campo 2FA e conferma. Ritorna true se l'inserimento è andato a buon fine.
async function submitOtpCode(code) {
  const filled = await page.evaluate((code) => {
    const vis = e => e && e.offsetParent !== null;
    const cand = [...document.querySelectorAll('input[type=text],input[type=tel],input[type=number],input:not([type])')].filter(vis);
    const looksOtp = e => /otp|codice|token|verif|pin|sicurezza|one.?time|passcode|authenticator|2fa|mfa|totp/i.test((e.name || '') + ' ' + (e.id || '') + ' ' + (e.placeholder || '') + ' ' + ((e.closest('form,div,label') || {}).innerText || ''));
    const el = cand.find(looksOtp) || cand[0];
    if (!el) return false;
    el.focus(); el.value = code; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, code).catch(() => false);
  if (!filled) return false;
  await trustDevice();
  await page.waitForTimeout(400);
  await clickSubmit();
  await page.waitForTimeout(5000);
  return true;
}
// Spunta "ricorda questo dispositivo per 30 giorni" (e simili) per evitare il 2FA nei login futuri.
async function trustDevice() {
  const n = await page.evaluate(() => {
    const vis = e => e && e.offsetParent !== null;
    let done = 0;
    // checkbox espliciti
    for (const cb of [...document.querySelectorAll('input[type=checkbox],input[type=radio]')].filter(vis)) {
      const lbl = ((cb.closest('label,div,form,fieldset') || {}).innerText || '') + ' ' + (cb.name || '') + ' ' + (cb.id || '') + ' ' + (cb.value || '');
      if (/ricorda|ricordami|30\s*giorni|30\s*days|remember|fidat|trust|dispositivo|device|non chiedere|attendibile/i.test(lbl) && !cb.checked) { cb.click(); done++; }
    }
    // toggle/switch non-input (es. ARIA) con testo "ricorda/30 giorni"
    if (!done) {
      for (const t of [...document.querySelectorAll('[role=switch],[role=checkbox],label,button')].filter(vis)) {
        const txt = (t.innerText || t.getAttribute('aria-label') || '');
        if (/ricorda.*30|30\s*giorni|ricorda questo dispositivo|remember.*device/i.test(txt) && t.getAttribute('aria-checked') !== 'true') { t.click(); done++; break; }
      }
    }
    return done;
  }).catch(() => 0);
  return n;
}

// AUTO-LOGIN con 2FA TOTP: gira IN BACKGROUND.
let LOGIN_STATE = { running: false, step: 'idle', since: 0, msg: '' };
async function autoLoginFlow() {
  if (LOGIN_STATE.running) return LOGIN_STATE;
  LOGIN_STATE = { running: true, step: 'start', since: Date.now(), msg: '' };
  try {
    await ensurePage();
    const c = creds();
    if (!c.username || !c.password) { LOGIN_STATE = { running: false, step: 'error', since: Date.now(), msg: 'Credenziali assenti nel Pannello Fonti' }; return LOGIN_STATE; }
    await page.goto(c.loginUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(2500);
    // già loggato (sessione persistente)?
    if (!isLoginUrl(page.url()) && !(await hasPasswordField()) && !(await otpField())) { LOGIN_STATE = { running: false, step: 'loggato', since: Date.now(), msg: 'Sessione già attiva' }; return LOGIN_STATE; }
    // 1) utente + password
    if (await hasPasswordField()) {
      LOGIN_STATE.step = 'credenziali';
      const f = await fillUserPass(c.username, c.password);
      log('fill user/pass:', JSON.stringify(f));
      await trustDevice();
      await page.waitForTimeout(300);
      await clickSubmit();
      // Attende l'esito del submit fino ~28s: o compare la pagina 2FA, o si logga direttamente.
      for (let i = 0; i < 14; i++) {
        await page.waitForTimeout(2000);
        if (await otpField()) break;
        if (!isLoginUrl(page.url()) && !(await hasPasswordField())) break;
      }
    }
    // 2) 2FA: se compare la pagina del codice TOTP
    if (await otpField()) {
      const c2 = creds();
      if (c2.totpSecret) {
        // ── TOTP AUTOMATICO: genero il codice da solo e lo inserisco (retry su ±30s) ──
        LOGIN_STATE.step = 'invio_totp';
        log('pagina 2FA rilevata → genero il codice TOTP in autonomia');
        let submitted = false;
        // Provo fino a 2 volte: ad ogni tentativo rigenero la finestra di codici (corrente/±30s).
        for (let attempt = 0; attempt < 2 && !submitted; attempt++) {
          const codes = totpCandidates(c2.totpSecret);
          for (const code of codes) {
            log('tentativo TOTP:', code, '(attempt', attempt + 1 + ')');
            const ok = await submitOtpCode(code);
            if (!ok) break;
            if (!isLoginUrl(page.url()) && !(await hasPasswordField()) && !(await otpField())) { submitted = true; break; }
            // codice rifiutato: passo al candidato successivo / nuovo tentativo
          }
          if (!submitted && attempt === 0) await page.waitForTimeout(2000); // breve attesa prima del retry
        }
        if (!submitted) { LOGIN_STATE = { running: false, step: 'totp_rifiutato', since: Date.now(), msg: 'Codice TOTP rifiutato (verifica il segreto base32 in Fonti)' }; return LOGIN_STATE; }
      } else {
        // ── MANUALE: nessun segreto → attendo il codice di Google Authenticator dal Pannello Fonti ──
        LOGIN_STATE.step = 'attesa_otp';
        LOGIN_STATE.msg = 'Credenziali OK — inserisci il codice di Google Authenticator';
        log('pagina 2FA: CREDENZIALI OK. Attendo il codice Google Authenticator da QUOTO > Fonti > Prima (fino a 20 min)');
        const t0 = Date.now();
        const startCodTs = creds().codice_ts;
        let submitted = false;
        while (Date.now() - t0 < 20 * 60 * 1000) {
          await page.waitForTimeout(3000);
          // login completato nel frattempo (es. inserito via VNC)?
          if (!isLoginUrl(page.url()) && !(await hasPasswordField()) && !(await otpField())) { submitted = true; break; }
          const cc = creds();
          if (cc.codice && cc.codice_ts && cc.codice_ts >= startCodTs && (Date.now() - cc.codice_ts) < 20 * 60 * 1000) {
            LOGIN_STATE.step = 'invio_otp';
            log('codice ricevuto → lo inserisco');
            await submitOtpCode(cc.codice);
            if (!isLoginUrl(page.url()) && !(await hasPasswordField()) && !(await otpField())) { submitted = true; break; }
            // codice errato/scaduto: torno ad attendere un nuovo codice
            LOGIN_STATE.step = 'attesa_otp';
          }
        }
        if (!submitted) { LOGIN_STATE = { running: false, step: 'timeout_otp', since: Date.now(), msg: 'Codice 2FA non ricevuto in tempo' }; return LOGIN_STATE; }
      }
    }
    const ok = !isLoginUrl(page.url()) && !(await hasPasswordField()) && !(await otpField());
    if (ok) { await ctx.storageState({ path: path.join(__dir, 'auth.json') }).catch(() => {}); }
    LOGIN_STATE = { running: false, step: ok ? 'loggato' : 'non_loggato', since: Date.now(), msg: ok ? 'Login completato' : 'Login non riuscito (verifica credenziali/segreto TOTP)' };
    return LOGIN_STATE;
  } catch (e) {
    LOGIN_STATE = { running: false, step: 'error', since: Date.now(), msg: e.message };
    return LOGIN_STATE;
  }
}

// Avvio: se c'è il segreto TOTP, posso loggarmi DA SOLO (genero il codice). Se invece il 2° fattore
// è MANUALE (nessun segreto), NON invio le credenziali da solo: aspetto che l'utente avvii il login
// da Fonti, così inserisce il codice di Google Authenticator quando è pronto (finestra 20 min).
(async () => {
  try {
    await ensurePage();
    if (await loggedIn()) { LOGIN_STATE = { running: false, step: 'loggato', since: Date.now(), msg: 'Sessione attiva' }; log('sessione persistente attiva ✅'); return; }
    if (creds().totpSecret) { log('segreto TOTP presente → login automatico'); await autoLoginFlow(); }
    else { LOGIN_STATE = { running: false, step: 'pronto', since: Date.now(), msg: 'Pronto: avvia il login da Fonti e inserisci il codice Google Authenticator' }; log('PRONTO al login (2FA manuale) — attendo /login dall\'utente'); }
  } catch (e) { log('check iniziale err:', e.message); }
})();
// Keep-alive leggero: tiene viva la sessione (non durante un login in corso)
setInterval(async () => { if (LOGIN_STATE.running) return; try { await ensurePage(); await page.goto(creds().loginUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch {} }, 6 * 60 * 1000);

// ── HTTP: telecomando (stesso stile degli altri scraper) ───────────────────────
http.createServer(async (req, res) => {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname.startsWith('/status')) {
      let loggato = false; try { loggato = await loggedIn(); } catch {}
      const c = creds();
      return res.end(JSON.stringify({ url: page.url(), loggato, login_step: LOGIN_STATE.step, login_running: LOGIN_STATE.running, ha_credenziali: !!(c.username && c.password), ha_totp: !!c.totpSecret, login_msg: LOGIN_STATE.msg || '', codice_in_attesa: !!(c.codice && (Date.now() - c.codice_ts) < 20 * 60 * 1000) }));
    }
    if (u.pathname.startsWith('/login')) {
      // avvia (o riprende) il login in BACKGROUND e ritorna subito lo stato
      autoLoginFlow();
      return res.end(JSON.stringify({ ok: true, ...LOGIN_STATE }));
    }
    if (u.pathname.startsWith('/loginstate')) {
      return res.end(JSON.stringify(LOGIN_STATE));
    }
    if (u.pathname.startsWith('/logindump')) {
      const dump = await page.evaluate(() => {
        const vis = e => e && e.offsetParent !== null;
        const ctrls = [...document.querySelectorAll('input,select,button,a[role=button]')].filter(vis).slice(0, 40)
          .map(e => ({ tag: e.tagName.toLowerCase(), type: e.type || '', id: e.id || '', name: e.name || '', placeholder: e.placeholder || '', label: (e.innerText || e.value || '').slice(0, 40) }));
        return { url: location.href, title: document.title, text: (document.body.innerText || '').slice(0, 600), ctrls };
      }).catch(e => ({ error: e.message }));
      return res.end(JSON.stringify(dump, null, 2));
    }
    if (u.pathname.startsWith('/explore')) {
      const g = k => u.searchParams.get(k) || '';
      const doSniff = g('sniff') === '1';
      if (doSniff) sniffStart();
      if (g('goto')) { let p = g('goto'); if (!/^https?:/i.test(p)) p = origin(creds().loginUrl) + (p.startsWith('/') ? p : '/' + p); await page.goto(p, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}); await page.waitForTimeout(2500); }
      if (g('click')) { await page.evaluate((t) => { const el = [...document.querySelectorAll('a,button,[role=button],span,div')].find(e => (e.innerText || '').trim().toLowerCase().includes(t.toLowerCase())); if (el) el.click(); }, g('click')).catch(() => {}); await page.waitForTimeout(2500); }
      if (g('fill')) { await page.evaluate((v) => { const i = document.querySelector('input[type=text],input:not([type])'); if (i) { i.focus(); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); } }, g('fill')).catch(() => {}); await page.waitForTimeout(800); }
      const dump = await page.evaluate(() => {
        const vis = e => e && e.offsetParent !== null;
        const fields = [...document.querySelectorAll('input,select')].filter(vis).slice(0, 40).map(e => ({ tag: e.tagName.toLowerCase(), type: e.type || '', id: e.id || '', name: e.name || '', placeholder: e.placeholder || '' }));
        const links = [...document.querySelectorAll('a,button,[role=button]')].filter(vis).map(e => (e.innerText || '').trim()).filter(Boolean).slice(0, 40);
        return { url: location.href, title: document.title, text: (document.body.innerText || '').slice(0, 400), fields, menu: links };
      }).catch(e => ({ error: e.message }));
      const captured = doSniff ? sniffStop().map(e => ({ k: e.kind, m: e.method, s: e.status, url: e.url, body: String(e.body || '').slice(0, 1500) })) : [];
      return res.end(JSON.stringify({ ...dump, captured }, null, 2));
    }
    if (u.pathname.startsWith('/shot')) {
      const buf = await page.screenshot({ fullPage: false }).catch(() => null);
      if (!buf) return res.end(JSON.stringify({ error: 'screenshot fallito' }));
      res.setHeader('content-type', 'image/png'); return res.end(buf);
    }
    if (u.pathname.startsWith('/premio')) {
      // Preventivatore Prima: da mappare (il flusso verrà costruito come per HDI/Italiana).
      return res.end(JSON.stringify({ ok: false, error: 'Preventivatore Prima non ancora implementato: prima va mappato il flusso (login OK).' }));
    }
    res.statusCode = 404; return res.end(JSON.stringify({ error: 'endpoint sconosciuto' }));
  } catch (e) { res.statusCode = 500; return res.end(JSON.stringify({ error: e.message })); }
}).listen(PORT, '127.0.0.1', () => log('telecomando HTTP su 127.0.0.1:' + PORT));
