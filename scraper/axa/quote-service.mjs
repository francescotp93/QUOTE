// ─────────────────────────────────────────────────────────────────────────────
//  Prima Assicurazioni — scraper portale (login con secondo fattore TOTP).
//  Porta 4600, display :94, VNC 5905. Credenziali dal Pannello Fonti (fonte c-axa).
//  2FA: dopo utente+password il portale chiede un codice TOTP (AXA Guardian).
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
const FONTE_ID = process.env.FONTE_ID || 'c-axa';
const DEFAULT_LOGIN = 'https://ais.axa-italia.it/';
const PORT = parseInt(process.env.PORT || '4700', 10);
const log = (...a) => console.log(new Date().toLocaleTimeString('it-IT'), '[axa]', ...a);

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
    for (const k of Object.keys(cs)) if (/axa/i.test(cs[k].nome || '')) return cs[k];
    return {};
  } catch { return {}; }
}
// Il link salvato a volte si "sporca" con un callback OIDC monouso (…/portal/?code=…&state=…):
// quel codice è già stato consumato → ad ogni nuovo login dà "Login non riuscito". Se riconosco un
// callback (code/state/session_state/iss nella query), lo IGNORO e uso il link di login stabile.
function safeLoginUrl(raw) {
  const u = (raw && String(raw).trim()) || '';
  if (!u) return DEFAULT_LOGIN;
  if (/[?&](code|state|session_state|iss)=/i.test(u)) return DEFAULT_LOGIN;
  return u;
}
function creds() {
  const s = rawFonte();
  return {
    username: dec(s.username), password: dec(s.password),
    totpSecret: s.totp ? dec(s.totp) : '',
    codice: s.codice ? dec(s.codice) : '', codice_ts: s.codice_ts || 0,
    loginUrl: safeLoginUrl(s.url),
  };
}
const origin = (u) => { try { return new URL(u).origin; } catch { return 'https://www.axa.it'; } };

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

// ── Browser persistente (semplice e stabile come Groupama). AXA NON è dietro Cloudflare
// (SiteMinder + Auth0 Guardian), quindi niente stealth/UA custom/IsolateOrigins: erano la
// causa dei crash del browser. Sessione su disco → il 2FA non si reinserisce ad ogni avvio.
async function launchCtx() {
  for (const f of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) { try { fs.rmSync(userDataDir + '/' + f, { force: true }); } catch {} }
  const c = await chromium.launchPersistentContext(userDataDir, {
    headless: false, viewport: null, locale: 'it-IT',
    args: ['--no-sandbox', '--start-maximized', '--disable-blink-features=AutomationControlled',
      // ── Ottimizzazione RAM/CPU (server piccolo): meno processi, niente GPU/estensioni/telemetria ──
      '--disable-dev-shm-usage', '--disable-gpu', '--disable-software-rasterizer', '--disable-extensions',
      '--disable-component-update', '--disable-background-networking', '--disable-sync', '--mute-audio',
      '--no-first-run', '--no-default-browser-check', '--metrics-recording-only',
      '--disable-features=Translate,MediaRouter,OptimizationHints,BackForwardCache', '--renderer-process-limit=4'],
  });
  // Alleggerisco il traffico: blocco font, media e tracker (MAI recaptcha/asset funzionali) → pagine più veloci, meno RAM.
  try {
    const BLOCK = /googletagmanager|google-analytics|\/collect(\?|$)|doubleclick|hotjar|fullstory|mouseflow|clarity\.ms|optimizely|segment\.(io|com)|facebook\.(com|net)|fbcdn|onetrust|cookielaw|quantserve|scorecardresearch/i;
    await c.route('**/*', route => { try { const r = route.request(), ty = r.resourceType(); if (ty === 'media' || ty === 'font' || BLOCK.test(r.url())) return route.abort(); return route.continue(); } catch { try { return route.continue(); } catch {} } });
  } catch {}
  return c;
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
  // "chiusa" non basta: una pagina crashata o rimasta su about:blank NON risulta closed ma non
  // risponde più (page.evaluate va in errore/timeout). La verifico davvero e, se è rotta, la ricreo;
  // se anche la nuova non risponde, rilancio l'intero contesto del browser.
  const alive = async () => { try { await Promise.race([page.evaluate(() => 1), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 4000))]); return true; } catch { return false; } };
  try { if (page && !page.isClosed() && await alive()) return; } catch {}
  log('[recovery] pagina non risponde → la ricreo');
  try {
    page = ctx.pages().find(p => { try { return !p.isClosed(); } catch { return false; } }) || await ctx.newPage();
    if (!(await alive())) throw new Error('nuova pagina non risponde');
  } catch (e) {
    log('[recovery] contesto morto → rilancio:', e.message);
    try { await ctx.close().catch(() => {}); } catch {}
    try { ctx = await launchCtx(); wireSniff(ctx); page = ctx.pages()[0] || await ctx.newPage(); }
    catch (e2) { log('[recovery] rilancio fallito (' + e2.message + ') → esco: systemd riavvia con Xvfb pulito'); process.exit(1); }
  }
}

// Solo il PERCORSO (non i parametri): il callback di ritorno mobility.axa-italia.it/portal/?...iss=...auth...
// conteneva "auth" nella query e veniva scambiato per una pagina di login → pallino mai verde.
const isLoginUrl = (url) => /login|signin|accedi|auth|sso|mfa|totp|verify|2fa|siteminder|usernameoremail/i.test(String(url || '').split('?')[0]);
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

// PASSIVO: con Cloudflare NON ri-navigo ad ogni controllo di stato (le navigazioni ripetute
// facevano scattare il blocco). Giudico l'accesso dalla pagina su cui SIAMO già.
const PORTAL_URL = 'https://mobility.axa-italia.it/portal/';
// Cache dello stato di login (/status pollato spesso → evito di navigare ogni volta).
let logCache = { v: false, t: 0 };
const setLogged = (v) => { logCache = { v, t: Date.now() }; };
async function loggedIn() {
  if (HOLD || BUSY) return false; // login/2FA in corso
  if (QUOTING) return logCache.v; // preventivo in corso: non navigo via, uso la cache (siamo loggati)
  if (Date.now() - logCache.t < 45000) return logCache.v; // risultato fresco
  await ensurePage();
  let u = page.url() || '';
  // AXA non ha Cloudflare: se non siamo già sul portale, navigo UNA volta per verificare la sessione
  // (la sessione vive nei cookie persistenti: dopo un riavvio la pagina è about:blank ma la sessione
  // può essere ancora valida → senza navigare risulterebbe falsamente "scaduta").
  if (!/\/portal\//i.test(u)) {
    await page.goto(PORTAL_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(3000);
    u = page.url() || '';
  }
  let r = true;
  if (await hasPasswordField()) r = false;
  else if (await otpField()) r = false;
  else if (isLoginUrl(u.split('?')[0])) r = false;
  else r = /\/portal\/|mobility\.axa/i.test(u);
  setLogged(r);
  return r;
}

// Compila utente/email+password con azioni NATIVE Playwright. Prima usa Auth0 (React): gli eventi
// sintetici (.value a mano) vengono IGNORATI dal framework → serve page.fill (utente vero).
async function fillUserPass(u, p) {
  try {
    // email/username = primo input testo/email visibile (Auth0: "Inserisci il tuo indirizzo email")
    const user = page.locator('input[type="email"]:visible, input[type="text"]:visible, input:not([type]):visible').first();
    if (await user.count().catch(() => 0)) { try { await user.fill(u, { timeout: 5000 }); } catch (e) {} }
    // password (può comparire sulla stessa schermata o dopo un "Procedi")
    const pwd = page.locator('input[type="password"]').first();
    if (await pwd.count().catch(() => 0)) {
      try { await pwd.waitFor({ state: 'visible', timeout: 4000 }); await pwd.fill(p, { timeout: 5000 }); return { ok: true }; } catch (e) {}
    }
    return { ok: true, note: 'password non visibile (forse step successivo)' };
  } catch (e) { return { ok: false, reason: e.message }; }
}
// Clic NATIVO sul pulsante (Procedi/Continua/Accedi/Conferma…), evitando "Recupera password" ecc.
async function clickSubmit() {
  for (const re of [/^\s*procedi\s*$/i, /^\s*continua\s*$/i, /^\s*accedi\s*$/i, /^\s*conferma\s*$/i, /^\s*entra\s*$/i, /^\s*avanti\s*$/i, /^\s*prosegui\s*$/i, /^\s*verifica\s*$/i, /^\s*login\s*$/i, /^\s*log\s*in\s*$/i]) {
    const b = page.getByRole('button', { name: re }).first();
    try { if (await b.count()) { await b.click({ timeout: 4000 }); return true; } } catch (e) {}
    const l = page.locator('input[type=submit], button, a[role=button]').filter({ hasText: re }).first();
    try { if (await l.count()) { await l.click({ timeout: 3000 }); return true; } } catch (e) {}
  }
  try { await page.locator('input[type=password]:visible, input[type=text]:visible').first().press('Enter', { timeout: 3000 }); return true; } catch (e) {}
  return false;
}
// Conferma del CODICE 2FA: clicca SOLO un pulsante di conferma, MAI Invio (eviterebbe 'Invia altro codice' → spam).
async function clickConfirm() {
  for (const re of [/^\s*continua\s*$/i, /^\s*conferma\s*$/i, /^\s*verifica\s*$/i, /^\s*accedi\s*$/i, /^\s*prosegui\s*$/i, /^\s*procedi\s*$/i]) {
    const b = page.getByRole('button', { name: re }).first();
    try { if (await b.count()) { await b.click({ timeout: 4000 }); return true; } } catch (e) {}
  }
  return false;
}
// Inserisce un codice nel campo 2FA (fill NATIVO: Auth0/React ignora gli eventi sintetici) e conferma.
async function submitOtpCode(code) {
  const filled = await (async () => {
    try { await page.locator('input[type=text]:visible, input[type=tel]:visible, input[type=number]:visible, input:not([type]):visible').first().fill(code, { timeout: 5000 }); return true; }
    catch (e) { return false; }
  })();
  if (!filled) return false;
  await trustDevice();
  await page.waitForTimeout(400);
  await clickConfirm();
  await page.waitForTimeout(5000);
  return true;
}
// Spunta "ricorda questo dispositivo per 30 giorni" (e simili) per evitare il 2FA nei login futuri.
// IMPORTANTE: il 2FA AXA Guardian è in un IFRAME → cerco la casella in TUTTI i frame (come il campo OTP),
// non solo nel documento principale, altrimenti la casella resta non spuntata e AXA richiede il codice OGNI giorno.
async function trustDevice() {
  let total = 0;
  for (const fr of [page.mainFrame(), ...page.frames()]) {
    const n = await fr.evaluate(() => {
      const vis = e => e && e.offsetParent !== null;
      let done = 0;
      // checkbox/radio espliciti
      for (const cb of [...document.querySelectorAll('input[type=checkbox],input[type=radio]')].filter(vis)) {
        const lbl = ((cb.closest('label,div,form,fieldset') || {}).innerText || '') + ' ' + (cb.name || '') + ' ' + (cb.id || '') + ' ' + (cb.value || '') + ' ' + (cb.getAttribute('aria-label') || '');
        if (/ricorda|ricordami|30\s*giorni|30\s*days|remember|fidat|trust|dispositiv|device|non chiedere|attendibil|questo browser|this browser/i.test(lbl) && !cb.checked) { cb.click(); done++; }
      }
      // toggle/switch non-input (es. ARIA) con testo "ricorda/30 giorni"
      if (!done) {
        for (const t of [...document.querySelectorAll('[role=switch],[role=checkbox],label,button')].filter(vis)) {
          const txt = (t.innerText || t.getAttribute('aria-label') || '');
          if (/ricorda.*30|30\s*giorni|ricorda questo dispositivo|remember.*device|remember.*browser|non chiedere/i.test(txt) && t.getAttribute('aria-checked') !== 'true') { t.click(); done++; break; }
        }
      }
      return done;
    }).catch(() => 0);
    total += n;
  }
  log(total ? ('trustDevice: spuntato "ricorda 30 giorni" (' + total + ')') : 'trustDevice: nessuna casella "ricorda 30 giorni" trovata in alcun frame');
  return total;
}

// Localizza il campo del codice 2FA in modo PRECISO (anche dentro iframe) e ritorna { frame, sel }.
async function findOtpLocator() {
  for (const fr of [page.mainFrame(), ...page.frames()]) {
    const info = await fr.evaluate(() => {
      const vis = e => e && e.offsetParent !== null;
      const cand = [...document.querySelectorAll('input[type=text],input[type=tel],input[type=number],input[type=password],input:not([type])')].filter(vis);
      const looksOtp = e => /otp|codice|token|verif|pin|sicurezza|one.?time|passcode|authenticator|2fa|mfa|totp|\bcode\b/i.test((e.name || '') + ' ' + (e.id || '') + ' ' + (e.placeholder || '') + ' ' + ((e.closest('form,div,label') || {}).innerText || ''));
      let e = cand.find(looksOtp) || (cand.length === 1 ? cand[0] : null) || cand[0];
      if (!e) return null;
      if (e.id) return { sel: '#' + (window.CSS && CSS.escape ? CSS.escape(e.id) : e.id) };
      if (e.name) return { sel: 'input[name="' + e.name + '"]' };
      e.setAttribute('data-quoto-otp', '1');
      return { sel: 'input[data-quoto-otp="1"]' };
    }).catch(() => null);
    if (info && info.sel) return { frame: fr, sel: info.sel };
  }
  return null;
}
// Inserisce il codice 2FA con più strategie e VERIFICA che il valore sia entrato (Auth0/React).
async function fillOtpCode(code) {
  const loc = await findOtpLocator();
  if (!loc) { log('2FA: nessun campo trovato per il fill'); return false; }
  const el = loc.frame.locator(loc.sel).first();
  const clean = s => String(s || '').replace(/\s/g, '');
  try { await el.click({ timeout: 3000, force: true }).catch(() => {}); await el.fill('', { timeout: 3000, force: true }).catch(() => {}); await el.fill(code, { timeout: 5000, force: true }); } catch (e) { log('2FA fill nativo ko:', e.message); }
  let val = await el.inputValue().catch(() => '');
  if (clean(val) !== clean(code)) {
    try { await el.click({ force: true, timeout: 3000 }); await el.pressSequentially(code, { delay: 60, timeout: 8000 }); } catch (e) { log('2FA type ko:', e.message); }
    val = await el.inputValue().catch(() => '');
  }
  if (clean(val) !== clean(code)) {
    await loc.frame.evaluate(({ sel, code }) => { const i = document.querySelector(sel); if (i) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(i, code); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); } }, { sel: loc.sel, code }).catch(() => {});
    val = await el.inputValue().catch(() => '');
  }
  log('2FA inserito → valore nel campo:', JSON.stringify(val), clean(val) === clean(code) ? 'OK' : '≠ codice');
  return clean(val) === clean(code);
}

// ── LOGIN GUIDATO A DUE SCHERMATE (come Groupama). Prima usa Auth0 + 2FA AXA Guardian. ──
let LOGIN_STATE = { running: false, step: 'idle', since: 0, msg: '' };
let HOLD = false;   // fermo sulla schermata 2FA, in attesa del codice dall'utente
let BUSY = false;
let QUOTING = false; // preventivo in corso → /status usa la cache, niente keep-alive che disturba
const setState = (step, msg, running = false) => { LOGIN_STATE = { running, step, since: Date.now(), msg }; if (step === 'loggato') setLogged(true); else if (['pronto', 'non_loggato', 'timeout_otp', 'error'].includes(step)) setLogged(false); return LOGIN_STATE; };
const isLogged = async () => /axa/i.test(page.url() || '') && !isLoginUrl(page.url()) && !(await hasPasswordField()) && !(await otpField());

// Naviga superando Cloudflare: la sfida JS ("Just a moment"/"verifica umano") si risolve da sola
// in qualche secondo; sul blocco duro ("you have been blocked") attendo e ritento (a volte il timing
// diverso passa). Navigo POCHE volte e con pause: le navigazioni a raffica peggiorano il blocco.
async function gotoCloudflare(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    // attendo che l'eventuale sfida JS si risolva (Cloudflare ricarica da solo verso la pagina vera)
    for (let w = 0; w < 6; w++) {
      await page.waitForTimeout(2500);
      const t = await page.evaluate(() => document.body ? document.body.innerText : '').catch(() => '');
      if (/just a moment|checking your browser|verifica.*umano|attendere|un attimo/i.test(t)) continue; // sfida in corso
      if (/you have been blocked|sorry, you have been/i.test(t)) break; // blocco duro → ritento la navigazione
      return true; // pagina reale (login o dashboard)
    }
    await page.waitForTimeout(3000 + i * 2000); // backoff prima del ritentativo
  }
  const t = await page.evaluate(() => document.body ? document.body.innerText : '').catch(() => '');
  return !/you have been blocked|just a moment|checking your browser/i.test(t);
}

// SUBMIT del form AXA SiteMinder: i pulsanti PROSEGUI/LOG IN sono elementi gestiti via JS (non
// input/button standard), quindi i selettori normali non li prendono. Provo, in ordine:
// 1) INVIO nel campo (la maggior parte dei form si invia così), 2) click sull'elemento col testo
// esatto LOG IN/PROSEGUI/ACCEDI (anche div/span/a), 3) submit diretto del <form>.
async function submitAxa() {
  // 0) eventuale disclaimer/consenso AXA da accettare PRIMA del login ("Ho letto e desidero continuare")
  await page.evaluate(() => {
    const vis = e => e && e.offsetParent !== null;
    for (const e of [...document.querySelectorAll('a,button,div,span,input')].filter(vis)) {
      const t = (e.innerText || e.value || '').trim();
      if (/^\s*(ho letto e desidero\s*continuare|accetto e continuo|accetto)\s*$/i.test(t)) { try { e.click(); } catch (x) {} }
    }
  }).catch(() => {});
  // 1) click sul LOG IN: su AXA è l'elemento id="button-entra"; in mancanza, l'elemento col testo esatto.
  await page.evaluate(() => {
    let btn = document.getElementById('button-entra');
    if (!btn) {
      const want = /^\s*(log\s*in|prosegui|accedi|entra|continua|avanti|conferma)\s*$/i;
      let best = null, bestKids = 1e9;
      for (const e of [...document.querySelectorAll('a,button,div,span,td,li,input,p,label')]) { const t = (e.innerText || e.value || '').trim(); if (want.test(t)) { const k = e.querySelectorAll('*').length; if (k < bestKids) { best = e; bestKids = k; } } }
      btn = best;
    }
    if (btn) try { btn.click(); } catch (x) {}
  }).catch(() => {});
  await page.waitForTimeout(1200);
  // 2) se siamo ANCORA sul form (campo password presente), faccio il submit ESPLICITO del form SiteMinder:
  //    il solo click sul bottone a volte non invia il POST → questo lo garantisce (USER/PASSWORD in chiaro su HTTPS).
  try {
    if (await page.$('input[type=password]')) {
      await page.evaluate(() => { const f = document.forms['LoginUserName'] || document.querySelector('form'); if (f) try { f.submit(); } catch (x) {} }).catch(() => {});
    }
  } catch (e) {}
  await page.waitForTimeout(800);
}

// AXA Guardian: di default manda un PUSH all'iPhone. Passo all'INSERIMENTO MANUALE del codice
// (come chiesto), spuntando "Ricorda questo dispositivo per 30 giorni", poi attendo il codice.
async function axaGuardianManuale() {
  try {
    const t = await page.evaluate(() => document.body ? document.body.innerText : '').catch(() => '');
    if (!/inserisci codice manualmente|verifica la tua identità|auth0 guardian|notifica push|mfa-push/i.test(t + ' ' + (page.url() || ''))) return false;
    await trustDevice(); // spunta "Ricorda questo dispositivo per 30 giorni"
    let clicked = false;
    for (const loc of [page.getByRole('button', { name: /inserisci codice manualmente/i }), page.getByText(/inserisci codice manualmente/i), page.locator('text=/inserisci codice/i')]) {
      try { const el = loc.first(); if (await el.count()) { await el.click({ timeout: 4000 }); clicked = true; break; } } catch (e) {}
    }
    await page.waitForTimeout(2000);
    await trustDevice(); // ri-spunta se la casella è anche sulla schermata del codice
    log('AXA Guardian → inserimento manuale attivato (clicked=' + clicked + ')');
    return true;
  } catch (e) { return false; }
}

// SCHERMATA 1 → 2: invia utente+password e fermati sulla schermata del codice 2FA (Guardian manuale).
// Se c'è il segreto TOTP, prova a generare il codice da solo; altrimenti resta in attesa (HOLD).
async function doAccedi() {
  if (BUSY) return LOGIN_STATE;
  BUSY = true; HOLD = false;
  try {
    setState('credenziali', 'Apro il portale (supero la protezione)…', true);
    await ensurePage();
    const c = creds();
    if (!c.username || !c.password) return setState('error', 'Credenziali assenti nel Pannello Fonti');
    // AXA NON è dietro Cloudflare: navigazione semplice (gotoCloudflare cicla su "attendere…" → lento).
    await page.goto(c.loginUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(1500);
    if (await isLogged()) { await ctx.storageState({ path: path.join(__dir, 'auth.json') }).catch(() => {}); return setState('loggato', 'Sessione già attiva ✅'); }
    // AXA SiteMinder: login a DUE PASSI → (1) User ID + PROSEGUI, (2) Password + LOG IN.
    {
      const pwdVisible = async () => (await page.locator('input[type=password]:visible').count().catch(() => 0)) > 0;
      // 1) User ID
      try { const u = page.locator('#username, input[name="USER" i]').first(); await u.waitFor({ state: 'visible', timeout: 10000 }); await u.fill(c.username, { timeout: 5000 }); log('AXA: User ID inserito'); } catch (e) { log('AXA user err:', e.message); }
      // se la password è già visibile (form unico), la metto subito
      if (await pwdVisible()) { try { await page.locator('input[type=password]:visible').first().fill(c.password, { timeout: 5000 }); log('AXA: password inserita (form unico)'); } catch (e) {} }
      await trustDevice();
      // 2) SUBMIT robusto (PROSEGUI/LOG IN sono elementi JS → Invio nel campo + click testo + form.submit)
      await submitAxa(); log('AXA: submit 1');
      await page.waitForTimeout(3000);
      // 3) se ora compare la password (form a due passi), la inserisco e ri-submit
      if (await pwdVisible()) {
        try { await page.locator('input[type=password]:visible').first().fill(c.password, { timeout: 5000 }); log('AXA: password inserita (passo 2)'); } catch (e) {}
        await trustDevice();
        await submitAxa(); log('AXA: submit 2');
      }
      // 4) Attesa esito: 2FA, pagina Guardian PUSH (→ codice manuale), oppure loggato.
      for (let i = 0; i < 18; i++) {
        await page.waitForTimeout(2000);
        if (await otpField()) break;
        if (await isLogged()) break;
        if (await axaGuardianManuale()) { if (await otpField()) break; }
        if (await pwdVisible()) { await page.locator('input[type=password]:visible').first().fill(c.password, { timeout: 4000 }).catch(() => {}); await trustDevice(); await submitAxa(); }
      }
    }
    if (await otpField()) {
      if (c.totpSecret) {
        setState('invio_totp', 'Genero il codice Guardian…', true);
        for (const code of totpCandidates(c.totpSecret)) { if (await fillOtpCode(code)) { await trustDevice(); await page.waitForTimeout(300); await clickConfirm(); await page.waitForTimeout(4000); if (await isLogged()) break; } }
        if (await isLogged()) { await ctx.storageState({ path: path.join(__dir, 'auth.json') }).catch(() => {}); return setState('loggato', 'Login completato ✅ (codice automatico)'); }
      }
      HOLD = true; log('schermata 2FA Guardian raggiunta: attendo il codice dall\'utente'); return setState('attesa_otp', 'Credenziali OK — apri AXA Guardian, prendi il codice e premi Conferma');
    }
    if (await isLogged()) { await ctx.storageState({ path: path.join(__dir, 'auth.json') }).catch(() => {}); return setState('loggato', 'Login completato ✅'); }
    // Distinguo la causa: password SCADUTA vs credenziali errate vs fallimento generico (messaggi chiari in card).
    const errTxt = await page.evaluate(() => document.body ? document.body.innerText : '').catch(() => '');
    if (/scadut|expired|cambia.*password|aggiorna.*password|modificare la password|reimposta.*password|password.*scadut/i.test(errTxt))
      return setState('non_loggato', 'La password AXA risulta SCADUTA: vai sul portale AXA, impostane una nuova e poi aggiornala in Fonti.');
    if (/non valid|errat|non corrett|autenticazione.*(fall|non)|credenziali.*(errat|non)|bloccat|locked|account.*disabilit|failed/i.test(errTxt))
      return setState('non_loggato', 'AXA ha rifiutato utente/password: probabilmente la password è cambiata/scaduta — aggiornala in Fonti.');
    return setState('non_loggato', 'Login non riuscito: utente/password non accettati. Se di recente hai cambiato la password AXA, aggiornala in Fonti.');
  } catch (e) { return setState('error', e.message); }
  finally { BUSY = false; }
}

// SCHERMATA 2 → CONFERMA: scrivi il codice (AXA Guardian) sulla pagina 2FA e conferma.
async function doCodice(codice) {
  if (BUSY) return { ok: false, step: LOGIN_STATE.step, msg: 'Operazione in corso, attendi un istante e riprova.' };
  if (!codice) return { ok: false, step: LOGIN_STATE.step, msg: 'Codice mancante.' };
  BUSY = true;
  try {
    await ensurePage();
    if (!(await otpField())) {
      if (await isLogged()) { HOLD = false; setState('loggato', 'Sessione già attiva ✅'); return { ok: true, loggato: true, step: 'loggato', msg: 'Accesso già attivo.' }; }
      HOLD = false; return { ok: false, step: 'pronto', msg: 'La schermata 2FA non è più attiva. Premi di nuovo "Accedi".' };
    }
    setState('invio_otp', 'Inserisco il codice…', true);
    const filled = await fillOtpCode(codice);
    if (!filled) { setState('attesa_otp', 'Non sono riuscito a scrivere il codice — riprova.'); return { ok: false, step: 'attesa_otp', msg: 'Non sono riuscito a scrivere il codice nel campo. Riprova.' }; }
    await trustDevice();
    await page.waitForTimeout(400);
    await clickConfirm();
    // dopo la conferma c'è il redirect OIDC verso il portale: può durare 15-25s → attendo con pazienza.
    // Nei primi secondi ri-provo a spuntare "ricorda 30 giorni": alcune versioni di Guardian mostrano la
    // casella su una schermata SUCCESSIVA al codice ("Vuoi ricordare questo dispositivo?").
    for (let i = 0; i < 30; i++) { await page.waitForTimeout(1000); if (i < 5) await trustDevice().catch(() => {}); if (await isLogged()) break; if (/\/portal\//i.test(page.url() || '')) break; }
    if ((await isLogged()) || /\/portal\//i.test(page.url() || '')) { HOLD = false; await ctx.storageState({ path: path.join(__dir, 'auth.json') }).catch(() => {}); setState('loggato', 'Login completato ✅'); return { ok: true, loggato: true, step: 'loggato', msg: 'Accesso eseguito ✅' }; }
    setState('attesa_otp', 'Codice non accettato — genera un nuovo codice e riprova.');
    return { ok: false, loggato: false, step: 'attesa_otp', msg: 'Codice non accettato. Apri AXA Guardian, prendi il nuovo codice a 6 cifre e riprova.' };
  } catch (e) { return { ok: false, step: LOGIN_STATE.step, msg: e.message }; }
  finally { BUSY = false; }
}
// Per AXA il codice lo genera l'app: "Invia altro codice" non esiste (informativo).
async function doResend() { return { ok: false, msg: 'Per AXA il codice lo genera AXA Guardian: apri l\'app, prendi il nuovo codice a 6 cifre e premi Conferma.' }; }
// Compat: /login (usato da "Verifica accesso") avvia il login guidato fino alla schermata 2FA.
async function autoLoginFlow() { return doAccedi(); }

// Avvio: se c'è il segreto TOTP, posso loggarmi DA SOLO (genero il codice). Se invece il 2° fattore
// è MANUALE (nessun segreto), NON invio le credenziali da solo: aspetto che l'utente avvii il login
// da Fonti, così inserisce il codice di AXA Guardian quando è pronto (finestra 20 min).
(async () => {
  try {
    await ensurePage();
    if (await loggedIn()) { setState('loggato', 'Sessione attiva'); log('sessione persistente attiva ✅'); }
    else { setState('pronto', 'Pronto: avvia il login da Fonti e inserisci il codice AXA Guardian'); log('PRONTO al login — attendo Accedi dall\'utente'); }
  } catch (e) { log('check iniziale err:', e.message); }
})();
// Keep-alive PASSIVO: con Cloudflare ri-navigare la pagina rischia di rifar scattare la sfida e
// di disturbare il login manuale via VNC. Tengo solo viva la pagina (no navigazione): la sessione
// persiste in userdata; se scade, si rifà il login una volta via VNC.
setInterval(async () => { if (LOGIN_STATE.running || HOLD || BUSY || QUOTING) return; try { await ensurePage(); if (!/\/portal\//i.test(page.url() || '')) await page.goto(PORTAL_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch {} }, 5 * 60 * 1000);

// ── PREVENTIVATORE AXA (EMISSIONE MOTOR — auto, autocarri, motocicli) ───────────
// Il portale Mobility è una SPA mono-frame: guido via click NATIVI per testo (i sintetici
// vengono ignorati) e leggo il premio dal testo della pagina. Stesso stile di ISA/Groupama.
async function axaFrame() {
  let best = page.mainFrame(), n0 = 0;
  for (const fr of page.frames()) { const n = await fr.evaluate(() => (document.body && document.body.innerText || '').length).catch(() => 0); if (n > n0) { n0 = n; best = fr; } }
  return best;
}
const axaText = async () => await (await axaFrame()).evaluate(() => document.body ? document.body.innerText : '').catch(() => '');
async function axaClick(t, postWait = 2500, exact = false) {
  const fr = await axaFrame();
  const cands = exact
    ? [fr.getByRole('button', { name: t, exact: true }), fr.getByRole('link', { name: t, exact: true }), fr.getByText(t, { exact: true })]
    : [fr.getByRole('button', { name: t }), fr.getByRole('link', { name: t }), fr.getByRole('menuitem', { name: t }), fr.getByText(t, { exact: true }), fr.getByText(t, { exact: false }), fr.locator(`text=${t}`)];
  for (const loc of cands) { try { const el = loc.first(); if (await el.count()) { await el.click({ timeout: 5000 }); await page.waitForTimeout(postWait); return true; } } catch (e) {} }
  return false;
}
async function axaFill(sel, val) {
  const fr = await axaFrame();
  try { const el = fr.locator(sel).first(); await el.click({ timeout: 3000, force: true }).catch(() => {}); await el.fill('', { timeout: 2500, force: true }).catch(() => {}); await el.fill(String(val), { timeout: 5000, force: true }); return true; }
  catch (e) { await fr.evaluate(({ sel, v }) => { const i = document.querySelector(sel); if (i) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); } }, { sel, v: String(val) }).catch(() => {}); return false; }
}
function drivePreventivoAXA(d) { QUOTING = true; return _drivePreventivoAXA(d).finally(() => { QUOTING = false; }); }
async function _drivePreventivoAXA(d) {
  const targa = String(d.targa || '').toUpperCase().replace(/\s+/g, '');
  if (!targa) return { ok: false, error: 'Targa mancante.' };
  await ensurePage();
  const sessionExpired = 'Sessione AXA scaduta: rifai il login da QUOTO → Fonti → AXA (codice Guardian), poi resta attiva 30 giorni.';
  // Porta il browser sulla dashboard del portale → 'ready' | 'expired' | 'notready'.
  // La SPA fa un giro OIDC (mobility → idp.axa-italia.it/oidc → ritorno): NON scambio il rimbalzo per login.
  // NB: NON uso otpField() (sulla dashboard c'è solo la barra di ricerca → falso 2FA). Scaduta = vero campo PASSWORD.
  const ensurePortal = async () => {
    await page.goto(PORTAL_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    let h = '';
    for (let i = 0; i < 22; i++) {
      await page.waitForTimeout(2000); h = await axaText();
      if (/EMISSIONE/i.test(h)) return 'ready';
      if (i >= 4 && (await hasPasswordField())) return 'expired';
    }
    return (await hasPasswordField()) ? 'expired' : 'notready';
  };
  let portal = await ensurePortal();
  if (portal === 'expired') {
    // RE-LOGIN AUTOMATICO: con "ricorda 30 giorni" bastano utente+password (niente Guardian) → la sessione
    // si rinnova da sola e l'utente non deve rifare il login ad ogni preventivo.
    log('sessione AXA scaduta → re-login automatico (utente+password)…');
    const st = await doAccedi();
    if (st.step !== 'loggato') return { ok: false, error: st.step === 'attesa_otp' ? 'Sessione AXA scaduta: apri AXA Guardian e rifai il login da Fonti → AXA (poi resta attiva 30 giorni).' : sessionExpired };
    portal = await ensurePortal();
  }
  if (portal !== 'ready') return { ok: false, error: portal === 'expired' ? sessionExpired : 'Portale AXA non pronto (tile EMISSIONE non comparsa in tempo).' };
  const _dbg = {};
  // 1) apri il pannello EMISSIONE MOTOR
  if (!(await axaClick('EMISSIONE MOTOR', 2500)) && !(await axaClick('EMISSIONE', 2500))) return { ok: false, error: 'Tile "Emissione Motor" non trovato sul portale.', dump: (await axaText()).slice(0, 200) };
  await page.waitForTimeout(1200);
  // 2) targa nel modale (primo input testo che non sia la barra di ricerca) + CERCA
  await axaFill('input[type=text]:not(#searchBar)', targa);
  await page.waitForTimeout(600);
  await axaClick('CERCA', 4000);
  // 3) attendo il riconoscimento del veicolo (compare "VAI ALLA QUOTAZIONE")
  let body = '';
  for (let i = 0; i < 18; i++) {
    await page.waitForTimeout(2000); body = await axaText();
    if (/VAI ALLA QUOTAZIONE/i.test(body)) break;
    if (/non.*trovat|nessun veicolo|targa non valida|non risulta/i.test(body)) return { ok: false, error: 'Veicolo non trovato per la targa ' + targa + '.', dump: body.slice(0, 250) };
  }
  if (!/VAI ALLA QUOTAZIONE/i.test(body)) return { ok: false, error: 'Veicolo non riconosciuto (timeout sul recupero).', dump: body.slice(0, 350) };
  // Memorizzo SUBITO la data di immatricolazione (pagina stabile): è il default per la "data acquisto".
  // Più avanti (dopo la conferma anagrafica) la pagina ri-renderizza e la lettura per id è inaffidabile.
  let immatr = '';
  for (let k = 0; k < 4 && !immatr; k++) { try { immatr = (await (await axaFrame()).locator('input#registrationDate').first().inputValue({ timeout: 2500 })).trim(); } catch (e) { _dbg.immatrErr = e.message; } if (!immatr) await page.waitForTimeout(1000); }
  _dbg.immatr = immatr;
  // 4) avente diritto / contraente: CF + (cognome, nome, data nascita) → conferma
  const cf = String(d.cf || '').toUpperCase().replace(/\s+/g, '');
  if (cf) {
    await axaFill('[id="2CFPI"]', cf);
    await page.waitForTimeout(400);
    await axaClick('TROVA', 2500, true);   // lookup avente diritto (preciso: NON "TROVA IN RIVISTA")
    await page.waitForTimeout(1500);
    // se non auto-compilati dall'anagrafica, inserisco cognome/nome/data di nascita
    if (d.cognome) await axaFill('[id="2COGNO"]', String(d.cognome).toUpperCase());
    if (d.nome) await axaFill('[id="2ONOME"]', String(d.nome).toUpperCase());
    if (d.data_nascita) await axaFill('[id="2DNA1C"]', d.data_nascita);
    await page.waitForTimeout(400);
    await axaClick('CONFERMA DATI ANAGRAFICI AVENTE DIRITTO', 2500);
    await page.waitForTimeout(1500);
  }
  // 5) "Data acquisto veicolo" (obbligatorio: senza, resta "Fattori del Bene non completi"). Se non passata,
  //    uso la data di immatricolazione già presente sulla pagina. Il campo non ha id pulito → XPath (1° input dopo l'etichetta).
  let dacq = String(d.data_acquisto || '').trim() || immatr;
  if (!dacq) { for (let k = 0; k < 4 && !dacq; k++) { try { dacq = (await (await axaFrame()).locator('input#registrationDate').first().inputValue({ timeout: 2000 })).trim(); } catch (e) {} if (!dacq) await page.waitForTimeout(1000); } }
  _dbg.dacq = dacq;
  if (dacq) {
    // Aggancio l'input SUBITO DOPO l'ETICHETTA esatta "Data acquisto veicolo" (non il messaggio d'errore,
    // che contiene lo stesso testo e falserebbe l'ordine). Lo taggo e poi lo riempio con digitazione reale.
    const frd = await axaFrame();
    const tagged = await frd.evaluate(() => {
      const vis = e => e && e.offsetParent !== null;
      const labels = [...document.querySelectorAll('label,span,div,b,strong,th,td,p')].filter(e => vis(e) && /^\s*Data acquisto veicolo\s*\*?\s*$/i.test((e.innerText || '').trim()));
      for (const lb of labels) {
        const after = [...document.querySelectorAll('input:not([type=hidden])')].filter(vis).find(i => lb.compareDocumentPosition(i) & Node.DOCUMENT_POSITION_FOLLOWING);
        if (after) { after.setAttribute('data-quoto-dacq', '1'); return true; }
      }
      return false;
    }).catch(() => false);
    _dbg.tagged = tagged;
    if (tagged) {
      const el = frd.locator('input[data-quoto-dacq="1"]').first();
      await el.click({ force: true, timeout: 4000 }).catch(() => {});
      await el.fill(dacq, { force: true, timeout: 4000 }).catch(async () => { await el.pressSequentially(dacq, { delay: 60 }).catch(() => {}); });
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(800);
    }
  }
  // 6) conferma fattori del veicolo
  await axaClick('CONFERMA FATTORI', 2500);
  await page.waitForTimeout(1500);
  // 7) vai alla quotazione (calcola il premio)
  await axaClick('VAI ALLA QUOTAZIONE', 4000);
  // 8) attendo il calcolo del premio (colonna "Premi a pagare (Premi lordi)")
  let q = '';
  for (let i = 0; i < 26; i++) {
    await page.waitForTimeout(2500); q = await axaText();
    if (/Premi a pagare|Premio annuo/i.test(q) && /[\d.]+,\d{2}/.test(q)) break;
    if (i > 12 && /fattori del bene non sono completi/i.test(q) && /VAI ALLA QUOTAZIONE/i.test(q)) return { ok: false, error: 'AXA chiede altri dati obbligatori prima della quotazione (fattori non completi).', dbg: _dbg, dump: q.slice(0, 300) };
  }
  // 9) estrazione premio. Il modale "Dichiarazione intermediario" non copre la colonna del premio;
  //    se però non lo leggo, provo a confermare con AVANTI e rileggo.
  const m = re => { const x = q.match(re); return x ? x[1].trim() : ''; };
  let premioStr = m(/Premio\s*annuo:?\s*([\d.]+,\d{2})/i) || m(/Premio\s*alla\s*firma:?\s*([\d.]+,\d{2})/i);
  if (!premioStr && /Dichiarazione intermediario/i.test(q)) { await axaClick('AVANTI', 2500); await page.waitForTimeout(2000); q = await axaText(); premioStr = m(/Premio\s*annuo:?\s*([\d.]+,\d{2})/i) || m(/Premio\s*alla\s*firma:?\s*([\d.]+,\d{2})/i); }
  if (!premioStr) premioStr = m(/Premi a pagare[\s\S]{0,120}?([\d.]+,\d{2})/i) || m(/([\d.]+,\d{2})\s*€/);
  const num = premioStr ? parseFloat(premioStr.replace(/\./g, '').replace(',', '.')) : null;
  const firma = m(/Premio\s*alla\s*firma:?\s*([\d.]+,\d{2})/i);
  return {
    ok: !!num, targa,
    premio_annuale_num: num,
    premio_annuale: premioStr ? premioStr + ' €' : '',
    premio_alla_firma: firma ? firma + ' €' : '',
    prodotto: /Nuova Protezione Auto/i.test(q) ? 'Nuova Protezione Auto' : '',
    dump: num ? undefined : q.slice(0, 600),
  };
}

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
    // /loginstate PRIMA di /login (altrimenti il polling dello stato ri-avvierebbe il login → 'start' infinito).
    if (u.pathname.startsWith('/loginstate')) {
      return res.end(JSON.stringify(LOGIN_STATE));
    }
    // ── LOGIN GUIDATO — match ESATTO del path (altrimenti /logindump cadrebbe in /login) ──
    if (u.pathname === '/accedi') {
      doAccedi(); await new Promise(r => setTimeout(r, 400)); const st = LOGIN_STATE; // NON bloccante: il frontend polla /loginstate
      return res.end(JSON.stringify({ ok: st.step === 'loggato' || st.step === 'attesa_otp', ...st }));
    }
    if (u.pathname === '/codice') {
      const codice = (u.searchParams.get('codice') || creds().codice || '').trim();
      const r = await doCodice(codice);
      return res.end(JSON.stringify(r));
    }
    if (u.pathname === '/resend') {
      const r = await doResend();
      return res.end(JSON.stringify(r));
    }
    if (u.pathname === '/login') {
      doAccedi(); await new Promise(r => setTimeout(r, 400)); const st = LOGIN_STATE; // NON bloccante: il frontend polla /loginstate
      return res.end(JSON.stringify({ ok: st.step === 'loggato', ...st }));
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
    // /probe?q=prosegui — HTML ESATTO degli elementi col testo cercato, in TUTTI i frame
    if (u.pathname.startsWith('/probe')) {
      const q = (u.searchParams.get('q') || 'prosegui').toLowerCase();
      const out = [];
      for (const fr of [page.mainFrame(), ...page.frames()]) {
        const found = await fr.evaluate((q) => {
          const re = new RegExp(q, 'i');
          return [...document.querySelectorAll('*')].filter(e => re.test((e.innerText || e.value || e.getAttribute('alt') || e.getAttribute('onclick') || ''))).slice(0, 6)
            .map(e => ({ tag: e.tagName.toLowerCase(), type: e.type || '', id: e.id || '', name: e.name || '', onclick: (e.getAttribute('onclick') || '').slice(0, 80), html: e.outerHTML.slice(0, 220) }));
        }, q).catch(() => []);
        if (found.length) out.push({ frame: (fr.url() || '').slice(0, 60), els: found });
      }
      return res.end(JSON.stringify({ frames: page.frames().length, matches: out }, null, 2));
    }
    if (u.pathname.startsWith('/explore')) {
      const g = k => u.searchParams.get(k) || '';
      const doSniff = g('sniff') === '1';
      if (doSniff) sniffStart();
      const before = ctx.pages().length;
      if (g('goto')) { let p = g('goto'); if (!/^https?:/i.test(p)) p = origin(creds().loginUrl) + (p.startsWith('/') ? p : '/' + p); await page.goto(p, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}); await page.waitForTimeout(2500); }
      // il portale AXA è una SPA: scelgo il frame col contenuto (o per nome)
      const pickFrame = async () => {
        const want = g('frame'); const frames = page.frames();
        if (want) { const f = frames.find(fr => (fr.url() || '').toLowerCase().includes(want.toLowerCase())); if (f) return f; }
        let best = page.mainFrame(), bestLen = 0;
        for (const fr of frames) { const n = await fr.evaluate(() => (document.body && document.body.innerText || '').length).catch(() => 0); if (n > bestLen) { bestLen = n; best = fr; } }
        return best;
      };
      let fr = await pickFrame();
      if (g('hover')) { try { await fr.getByText(g('hover'), { exact: false }).first().hover({ timeout: 4000 }); } catch (e) {} await page.waitForTimeout(1500); }
      // click NATIVO (la SPA AXA ignora i click sintetici)
      if (g('click')) {
        const t = g('click');
        const cands = [fr.getByRole('button', { name: t }), fr.getByRole('link', { name: t }), fr.getByRole('menuitem', { name: t }), fr.getByText(t, { exact: true }), fr.getByText(t, { exact: false }), fr.locator(`text=${t}`)];
        for (const loc of cands) { try { const el = loc.first(); if (await el.count()) { await el.click({ timeout: 4500 }); break; } } catch (e) {} }
        await page.waitForTimeout(2800);
      }
      if (g('href')) { try { await fr.locator('a[href*="' + g('href') + '" i]').first().click({ timeout: 4500 }); } catch (e) {} await page.waitForTimeout(2800); }
      if (g('fill')) {
        const val = g('fill');
        const sel = g('fillsel') || 'input[name*="targa" i], input[type=text]:visible, input:not([type]):visible, input[type=search]:visible';
        try { const el = fr.locator(sel).first(); await el.click({ timeout: 3000, force: true }).catch(() => {}); await el.fill(val, { timeout: 5000, force: true }); } catch (e) {
          await fr.evaluate(({ sel, v }) => { const i = document.querySelector(sel.split(',')[0]) || [...document.querySelectorAll('input')].find(x => x.offsetParent !== null); if (i) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); } }, { sel, v: val }).catch(() => {});
        }
        await page.waitForTimeout(800);
      }
      const pgs = ctx.pages();
      if (pgs.length > before) { const np = pgs[pgs.length - 1]; if (np && !np.isClosed()) { page = np; await page.waitForLoadState('domcontentloaded').catch(() => {}); await page.waitForTimeout(1500); fr = await pickFrame(); } }
      const all = g('all') === '1';
      const dump = await fr.evaluate((all) => {
        const vis = e => e && e.offsetParent !== null;
        const labelOf = e => { try { const c = e.closest('div,td,label,fieldset,th'); return (c ? (c.innerText || '') : '').replace(/\s+/g, ' ').trim().slice(0, 28); } catch { return ''; } };
        const fields = [...document.querySelectorAll('input,select')].filter(vis).slice(0, 70).map(e => ({ tag: e.tagName.toLowerCase(), type: e.type || '', id: e.id || '', name: e.name || '', placeholder: e.placeholder || '', val: String(e.value || '').slice(0, 30), req: !!(e.required || e.getAttribute('aria-required') === 'true' || /\*/.test(labelOf(e))), lbl: labelOf(e) }));
        const links = [...document.querySelectorAll('a,button,[role=button],input[type=submit],input[type=button]')].filter(e => all || vis(e)).slice(0, 90)
          .map(e => ({ t: (e.innerText || e.title || e.value || '').trim().slice(0, 45), href: (e.getAttribute && e.getAttribute('href')) || '', id: e.id || '', vis: vis(e) }))
          .filter(x => x.t || x.href);
        return { url: location.href, title: document.title, text: (document.body.innerText || '').slice(0, 600), fields, links };
      }, all).catch(e => ({ error: e.message }));
      const frameInfo = page.frames().map(f => ({ url: (f.url() || '').slice(0, 80) }));
      const captured = doSniff ? sniffStop().map(e => ({ k: e.kind, m: e.method, s: e.status, url: e.url, body: String(e.body || '').slice(0, 1500) })) : [];
      return res.end(JSON.stringify({ ...dump, frame: fr.url().slice(0, 80), frames: frameInfo, npages: ctx.pages().length, captured }, null, 2));
    }
    if (u.pathname.startsWith('/shot')) {
      // b64=1 → JPEG compatto in base64 (passa nel canale testo); altrimenti PNG binario.
      if (u.searchParams.get('b64') === '1') {
        const q = Math.max(10, Math.min(80, parseInt(u.searchParams.get('q') || '35', 10)));
        const buf = await page.screenshot({ fullPage: false, type: 'jpeg', quality: q }).catch(() => null);
        if (!buf) return res.end(JSON.stringify({ error: 'screenshot fallito' }));
        return res.end(JSON.stringify({ ok: true, mime: 'image/jpeg', bytes: buf.length, b64: buf.toString('base64') }));
      }
      const buf = await page.screenshot({ fullPage: false }).catch(() => null);
      if (!buf) return res.end(JSON.stringify({ error: 'screenshot fallito' }));
      res.setHeader('content-type', 'image/png'); return res.end(buf);
    }
    if (u.pathname.startsWith('/premio')) {
      // Preventivatore AXA EMISSIONE MOTOR (auto/autocarri/moto). Param: targa (obbl.), cf, cognome, nome, data_nascita (gg/mm/aaaa).
      const d = {
        targa: u.searchParams.get('targa') || '',
        cf: u.searchParams.get('cf') || '',
        cognome: u.searchParams.get('cognome') || '',
        nome: u.searchParams.get('nome') || '',
        data_nascita: u.searchParams.get('data_nascita') || u.searchParams.get('nascita') || '',
        data_acquisto: u.searchParams.get('data_acquisto') || u.searchParams.get('acquisto') || '',
      };
      try { const r = await drivePreventivoAXA(d); return res.end(JSON.stringify(r)); }
      catch (e) { return res.end(JSON.stringify({ ok: false, error: e.message })); }
    }
    res.statusCode = 404; return res.end(JSON.stringify({ error: 'endpoint sconosciuto' }));
  } catch (e) { res.statusCode = 500; return res.end(JSON.stringify({ error: e.message })); }
}).listen(PORT, '127.0.0.1', () => log('telecomando HTTP su 127.0.0.1:' + PORT));
