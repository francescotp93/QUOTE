// ─────────────────────────────────────────────────────────────────────────────
//  Groupama — scraper portale (login con OTP via email + sessione persistente).
//  Porta 4500, display :95, VNC 5904. Credenziali dal Pannello Fonti (fonte c-groupama).
//  OTP: dopo utente+password il portale invia un codice via email. L'utente lo inserisce
//  in QUOTO > Fonti > Groupama (POST /fonti/c-groupama/codice); qui lo leggiamo e lo
//  inviamo SULLA STESSA pagina OTP (polling), senza ripartire dal login. La sessione resta
//  persistente (userdata su disco) così l'OTP non va reinserito ad ogni preventivo.
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright';
import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { entroTempo } from '../comune/entroTempo.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const userDataDir = path.join(__dir, 'userdata');
const STORE = process.env.FONTI_STORE || path.join(__dir, '../../server/fonti.store.json');
const FONTE_ID = process.env.FONTE_ID || 'c-groupama';
const DEFAULT_LOGIN = 'https://accedi.groupama.it/pda/PortaleGA/index.xhtml';
const PORT = parseInt(process.env.PORT || '4500', 10);
const log = (...a) => console.log(new Date().toLocaleTimeString('it-IT'), '[groupama]', ...a);

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
    for (const k of Object.keys(cs)) if (/groupama/i.test(cs[k].nome || '')) return cs[k];
    return {};
  } catch { return {}; }
}
function creds() {
  const s = rawFonte();
  return {
    username: dec(s.username), password: dec(s.password),
    codice: s.codice ? dec(s.codice) : '', codice_ts: s.codice_ts || 0,
    loginUrl: (s.url && String(s.url).trim()) || DEFAULT_LOGIN,
  };
}
const origin = (u) => { try { return new URL(u).origin; } catch { return 'https://accedi.groupama.it'; } };

// ── Browser persistente (sessione su disco → OTP non si reinserisce ad ogni avvio) ──
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

// ── SNIFF (per mappare in seguito il preventivatore Groupama) ───────────────────
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
    ctx = await launchCtx(); wireSniff(ctx); page = ctx.pages()[0] || await ctx.newPage();
  }
}

// ATTENZIONE: su Groupama login e HOME hanno lo STESSO url (accedi.groupama.it/.../index.xhtml):
// l'URL NON distingue se sei loggato. Per questo l'accesso si riconosce dal CONTENUTO della pagina.
const isLoginUrl = (url) => /login|signin|auth|sso/i.test(url || ''); // solo gateway/login espliciti
async function hasPasswordField() { return await page.evaluate(() => [...document.querySelectorAll('input[type=password]')].some(e => e && e.offsetParent !== null)).catch(() => false); }
// Marcatore di sessione ATTIVA: la home del portale ha "Log out"/"Cambia password"/menu interni.
async function loggedMarker() {
  return await page.evaluate(() => {
    const hit = [...document.querySelectorAll('a,button,span,div,li')].some(e => /log\s*out|logout|esci|disconnetti|cambia password/i.test((e.innerText || '').trim()));
    const txt = document.body ? document.body.innerText || '' : '';
    return hit || /applicazioni|servizi interni|link utili|formazione/i.test(txt);
  }).catch(() => false);
}
// Pagina OTP = c'è un campo per il codice (testo/number/tel) e NON c'è la password.
async function otpField() {
  const isAuthsvc = /\/authsvc|\/sps\//i.test(page.url()); // gateway OTP di Groupama (IBM Security Verify)
  return await page.evaluate((isAuthsvc) => {
    const vis = e => e && e.offsetParent !== null;
    if ([...document.querySelectorAll('input[type=password]')].some(vis)) return false;
    const cand = [...document.querySelectorAll('input[type=text],input[type=tel],input[type=number],input:not([type])')].filter(vis);
    const looksOtp = e => /otp|codice|token|verif|pin|sicurezza|one.?time|passcode/i.test((e.name || '') + ' ' + (e.id || '') + ' ' + (e.placeholder || '') + ' ' + ((e.closest('form,div,label') || {}).innerText || ''));
    let e = cand.find(looksOtp);
    if (!e && isAuthsvc && cand.length) e = cand[0]; // sul gateway OTP basta il campo testo visibile
    if (!e && cand.length === 1) e = cand[0];
    return e ? (e.id || e.name || 'OTP') : false;
  }, isAuthsvc).catch(() => false);
}

// Localizza il campo OTP in modo PRECISO (anche dentro iframe) e ritorna { frame, sel }.
// Necessario perché il portale OTP (IBM Security Verify) può: avere altri input testo prima del
// codice, mettere il campo dietro un overlay, o annidarlo in un iframe → un generico ".first()"
// prendeva il campo sbagliato e .fill() andava in timeout.
async function findOtpLocator() {
  for (const fr of [page.mainFrame(), ...page.frames()]) {
    const info = await fr.evaluate(() => {
      const vis = e => e && e.offsetParent !== null;
      const cand = [...document.querySelectorAll('input[type=text],input[type=tel],input[type=number],input[type=password],input:not([type])')].filter(vis);
      const looksOtp = e => /otp|codice|token|verif|pin|sicurezza|one.?time|passcode|\bcode\b/i.test((e.name || '') + ' ' + (e.id || '') + ' ' + (e.placeholder || '') + ' ' + ((e.closest('form,div,label') || {}).innerText || ''));
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
// Inserisce il codice OTP con più strategie e VERIFICA che il valore sia entrato davvero.
async function fillOtpCode(code) {
  const loc = await findOtpLocator();
  if (!loc) { log('OTP: nessun campo trovato per il fill'); return false; }
  const el = loc.frame.locator(loc.sel).first();
  const clean = s => String(s || '').replace(/\s/g, '');
  // 1) fill nativo con force (supera overlay/animazioni che bloccano l'actionability)
  try { await el.click({ timeout: 3000, force: true }).catch(() => {}); await el.fill('', { timeout: 3000, force: true }).catch(() => {}); await el.fill(code, { timeout: 5000, force: true }); } catch (e) { log('OTP fill nativo ko:', e.message); }
  let val = await el.inputValue().catch(() => '');
  // 2) digitazione carattere per carattere (alcuni gateway leggono solo i keystroke)
  if (clean(val) !== clean(code)) {
    try { await el.click({ force: true, timeout: 3000 }); await el.pressSequentially(code, { delay: 60, timeout: 8000 }); } catch (e) { log('OTP type ko:', e.message); }
    val = await el.inputValue().catch(() => '');
  }
  // 3) ultima spiaggia: setter nativo + eventi React/JSF
  if (clean(val) !== clean(code)) {
    await loc.frame.evaluate(({ sel, code }) => { const i = document.querySelector(sel); if (i) { const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(i, code); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); } }, { sel: loc.sel, code }).catch(() => {});
    val = await el.inputValue().catch(() => '');
  }
  log('OTP inserito → valore nel campo:', JSON.stringify(val), clean(val) === clean(code) ? 'OK' : '≠ codice');
  return clean(val) === clean(code);
}

// Cache dello stato di login: /status viene pollato spesso; navigare ogni volta è pesante e,
// durante un preventivo (QUOTING) o un login (HOLD), disturberebbe la pagina condivisa.
let logCache = { v: false, t: 0 };
const setLogged = (v) => { logCache = { v, t: Date.now() }; };
// Verifica LEGGERA che la sotto-sessione ISA (quella che serve davvero alla quotazione) sia viva.
// PERCHÉ: il "guscio" del portale (accedi.groupama.it) e l'app ISA (PR_ISA) hanno sessioni SEPARATE;
// ISA ha un timeout d'inattività proprio e può scadere mentre il guscio è ancora loggato. In quel
// caso loggedMarker() dà verde (guscio ok) ma alla quotazione ISA ripropone l'OTP → il classico
// "devo rifare login in continuazione". Qui evito quel FALSO POSITIVO controllando anche ISA.
// Ritorna: true = ISA autenticata, false = ISA scaduta (login/OTP), null = esito INCERTO (timeout/
// transitorio) → il chiamante NON deve declassare a "non loggato" (anti falso-negativo).
async function isaCheck() {
  try {
    // timeout breve (20s, non 45): è un ping, non deve appesantire il poll di /status
    await page.goto(ISA_HOME, { waitUntil: 'domcontentloaded', timeout: 20000 });
  } catch { return null; }               // navigazione non riuscita: transitorio, non concludo "scaduta"
  await page.waitForTimeout(2000);
  if (await hasPasswordField()) return false; // ISA ha buttato fuori: ricompare il login del gateway
  if (await otpField()) return false;         // ISA richiede di nuovo l'OTP → non operativi
  // ISA carica la UI in un frame interno: la considero autenticata solo se un frame ha contenuto reale.
  const fr = await isaFrame();
  const txt = await frameText(fr);
  if ((txt || '').trim().length > 40) return true;
  return null;                           // ISA non ha ancora reso contenuto: incerto, non lo declasso
}
async function loggedIn() {
  if (inAttesaCodice() || BUSY) return false;           // login/OTP in corso
  if (QUOTING) return logCache.v;                        // preventivo in corso: NON navigare, uso l'ultimo stato
  if (Date.now() - logCache.t < 45000) return logCache.v; // risultato fresco: niente nuova navigazione (cache 45s = anche l'esito ISA è cache-ato con lo stesso TTL)
  await ensurePage();
  const c = creds();
  await page.goto(c.loginUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(3000);
  let r = true;
  if (await hasPasswordField()) r = false;
  else if (await otpField()) r = false;
  else r = await loggedMarker();
  // Guscio loggato ≠ ISA disponibile. Solo se il guscio è ok verifico ANCHE ISA (se sono già fuori
  // non aggiungo carico inutile). "Loggato" richiede ENTRAMBI ok, così il pallino verde riflette la
  // reale quotabilità. Su esito INCERTO (null: timeout/transitorio) faccio UN retry breve prima di
  // dichiarare non loggato, per non far diventare rosso il pallino quando basta un attimo.
  if (r) {
    let isa = await isaCheck();
    if (isa === null) { await page.waitForTimeout(1500); isa = await isaCheck(); } // 1 retry breve (anti falso-negativo)
    if (isa === false) r = false; // ISA scaduta/login: NON siamo realmente operativi → rosso corretto
    // isa === true → confermo loggato; isa === null anche dopo il retry → transitorio, NON declasso
  }
  setLogged(r);
  return r;
}

// Compila utente+password con azioni NATIVE Playwright (i portali React/JSF ignorano gli eventi
// sintetici: .value impostato a mano non viene "visto" dal framework). page.fill simula l'utente vero.
async function fillUserPass(u, p) {
  try {
    const pwd = page.locator('input[type="password"]').first();
    await pwd.waitFor({ state: 'visible', timeout: 8000 });
    // username/email = primo input testuale visibile (escludo i campi nascosti/di servizio)
    const user = page.locator('input[type="text"]:visible, input[type="email"]:visible, input[type="tel"]:visible, input:not([type]):visible').first();
    if (await user.count().catch(() => 0)) { try { await user.fill(u, { timeout: 5000 }); } catch (e) {} }
    await pwd.fill(p, { timeout: 5000 });
    return { ok: true };
  } catch (e) { return { ok: false, reason: e.message }; }
}
// Clic NATIVO sul pulsante di avanzamento (Accedi/Procedi/Conferma/Continua…), evitando i pulsanti
// sbagliati (Invia altro codice / Recupera password). Fallback: Invio nel campo password/OTP.
async function clickSubmit() {
  for (const re of [/^\s*accedi\s*$/i, /^\s*procedi\s*$/i, /^\s*conferma\s*$/i, /^\s*continua\s*$/i, /^\s*entra\s*$/i, /^\s*avanti\s*$/i, /^\s*prosegui\s*$/i, /^\s*verifica\s*$/i, /^\s*login\s*$/i]) {
    const b = page.getByRole('button', { name: re }).first();
    try { if (await b.count()) { await b.click({ timeout: 4000 }); return true; } } catch (e) {}
    const l = page.locator('input[type=submit], button, a[role=button]').filter({ hasText: re }).first();
    try { if (await l.count()) { await l.click({ timeout: 3000 }); return true; } } catch (e) {}
  }
  // fallback: premi Invio nel campo visibile (password o codice)
  try { await page.locator('input[type=password]:visible, input[type=text]:visible').first().press('Enter', { timeout: 3000 }); return true; } catch (e) {}
  return false;
}
// Conferma del CODICE OTP: clicca SOLO un pulsante di conferma. NIENTE fallback Invio, perché sulla
// pagina OTP l'Invio può scatenare "Invia altro codice" → nuovo OTP ad ogni tentativo (spam).
async function clickConfirm() {
  for (const fr of [page.mainFrame(), ...page.frames()]) {
    for (const re of [/^\s*conferma\s*$/i, /^\s*continua\s*$/i, /^\s*verifica\s*$/i, /^\s*accedi\s*$/i, /^\s*prosegui\s*$/i, /^\s*procedi\s*$/i, /^\s*invia\s*$/i]) {
      const b = fr.getByRole('button', { name: re }).first();
      try { if (await b.count()) { await b.click({ timeout: 4000, force: true }); return true; } } catch (e) {}
      const l = fr.locator('input[type=submit], button').filter({ hasText: re }).first();
      try { if (await l.count()) { await l.click({ timeout: 3000, force: true }); return true; } } catch (e) {}
    }
  }
  return false;
}
// Spunta un eventuale "ricorda questo dispositivo / fidati" per evitare l'OTP nei login futuri.
async function trustDevice() {
  await page.evaluate(() => {
    const vis = e => e && e.offsetParent !== null;
    for (const cb of [...document.querySelectorAll('input[type=checkbox]')].filter(vis)) {
      const lbl = ((cb.closest('label,div,form') || {}).innerText || '') + ' ' + (cb.name || '') + ' ' + (cb.id || '');
      if (/ricorda|fidat|trust|dispositivo|device|non chiedere|30\s*giorni|30\s*days|remember/i.test(lbl) && !cb.checked) cb.click();
    }
  }).catch(() => {});
}

// ── LOGIN GUIDATO A DUE SCHERMATE (come il portale vero) ────────────────────────
// 1) /accedi  → invio utente+password, il portale manda l'OTP via email, RESTO fermo
//               sulla schermata OTP (HOLD) — niente più cicli in background che indovinano.
// 2) /codice  → scrivo il codice che l'utente ha incollato e premo Conferma (SINCRONO).
// 3) /resend  → premo "Invia altro codice" sulla stessa schermata.
// HOLD tiene viva la pagina OTP fra una chiamata e l'altra: keep-alive e /status NON navigano
// (altrimenti la schermata del codice sparirebbe e il fill andava in timeout — il bug di prima).
let LOGIN_STATE = { running: false, step: 'idle', since: 0, msg: '' };
let HOLD = false;   // fermo sulla schermata OTP, in attesa del codice dall'utente
/* ...ma non per sempre. Se l'agente preme «Accedi», arriva alla schermata del
   codice e poi cambia idea (chiude il pannello Fonti, cambia pagina, se ne va),
   HOLD restava acceso A VITA: da lì il keep-alive non gira più, la sessione
   muore di inattività e il giorno dopo bisogna riaccedere. Il codice scade in
   pochi minuti, quindi oltre questa soglia si molla e si torna a tenere viva la
   sessione. */
const HOLD_MAX_MS = 10 * 60 * 1000;
let HOLD_DA = 0;
function inAttesaCodice() {
  if (!HOLD) return false;
  if (Date.now() - HOLD_DA > HOLD_MAX_MS) { HOLD = false; log('attesa del codice scaduta (10 min): il keep-alive riprende'); return false; }
  return true;
}
let BUSY = false;   // un'operazione sincrona (accedi/codice/resend) è in corso
let QUOTING = false; // un preventivo ISA è in corso (il keep-alive non deve toccare la pagina)
const setState = (step, msg, running = false) => { LOGIN_STATE = { running, step, since: Date.now(), msg }; if (step === 'loggato') setLogged(true); else if (['pronto', 'non_loggato', 'timeout_otp', 'error'].includes(step)) setLogged(false); return LOGIN_STATE; };
const isLogged = async () => !(await hasPasswordField()) && !(await otpField()) && (await loggedMarker());

// SCHERMATA 1 → 2: invia le credenziali e fermati sulla pagina OTP.
async function doAccedi() {
  if (BUSY) return LOGIN_STATE;
  BUSY = true; HOLD = false;
  try {
    setState('credenziali', 'Invio utente e password…', true);
    await ensurePage();
    const c = creds();
    if (!c.username || !c.password) return setState('error', 'Credenziali assenti nel Pannello Fonti');
    await page.goto(c.loginUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(2500);
    // Il guscio loggato NON basta: la quotazione vive in ISA, che scade per conto suo.
    // Dichiaro «già attiva» solo se ANCHE ISA risponde. isaCheck() naviga su ISA: se è
    // scaduta, da qui riemerge il login/OTP e proseguo con la vera riautenticazione —
    // così «Accedi» porta alla schermata del codice invece di dare un verde falso (era
    // il caso di «accedi non apre la parte per il codice»: guscio dentro, ISA fuori).
    if (await isLogged() && (await isaCheck()) === true) {
      await ctx.storageState({ path: path.join(__dir, 'auth.json') }).catch(() => {});
      return setState('loggato', 'Sessione già attiva ✅');
    }
    await page.waitForTimeout(1200);
    if (await hasPasswordField()) {
      const f = await fillUserPass(c.username, c.password);
      log('fill user/pass:', JSON.stringify(f));
      await trustDevice();
      await page.waitForTimeout(300);
      await clickSubmit();
      // la schermata OTP (gateway IBM) ci mette qualche secondo a comparire
      for (let i = 0; i < 14; i++) { await page.waitForTimeout(2000); if (await otpField()) break; if (!isLoginUrl(page.url()) && !(await hasPasswordField())) break; }
    }
    if (await otpField()) { HOLD = true; HOLD_DA = Date.now(); log('schermata OTP raggiunta: attendo il codice dall\'utente (resto fermo qui)'); return setState('attesa_otp', 'Credenziali OK — inserisci il codice OTP ricevuto via email'); }
    // Logged solo se il guscio è dentro E ISA non è definitivamente fuori (null = incerto:
    // non blocco un login vero perché ISA è lenta a rendere).
    if (await isLogged() && (await isaCheck()) !== false) { await ctx.storageState({ path: path.join(__dir, 'auth.json') }).catch(() => {}); return setState('loggato', 'Login completato ✅'); }
    return setState('non_loggato', 'Login non riuscito: controlla utente/password.');
  } catch (e) { return setState('error', e.message); }
  finally { BUSY = false; }
}

// SCHERMATA 2 → CONFERMA: scrivi il codice sulla pagina OTP tenuta viva e premi Conferma.
async function doCodice(codice) {
  if (BUSY) return { ok: false, step: LOGIN_STATE.step, msg: 'Operazione in corso, attendi un istante e riprova.' };
  if (!codice) return { ok: false, step: LOGIN_STATE.step, msg: 'Codice mancante.' };
  BUSY = true;
  try {
    await ensurePage();
    if (!(await otpField())) {
      if (await isLogged()) { HOLD = false; setState('loggato', 'Sessione già attiva ✅'); return { ok: true, loggato: true, step: 'loggato', msg: 'Accesso già attivo.' }; }
      HOLD = false; return { ok: false, step: 'pronto', msg: 'La schermata OTP non è più attiva. Premi di nuovo "Accedi" per ricevere un nuovo codice.' };
    }
    setState('invio_otp', 'Inserisco il codice…', true);
    const filled = await fillOtpCode(codice);
    if (!filled) { setState('attesa_otp', 'Non sono riuscito a scrivere il codice nel campo — riprova.'); return { ok: false, step: 'attesa_otp', msg: 'Non sono riuscito a scrivere il codice nel campo. Riprova.' }; }
    await trustDevice();
    await page.waitForTimeout(400);
    await clickConfirm(); // SOLO "Conferma" — MAI Invio (eviterebbe "Invia altro codice")
    for (let i = 0; i < 8; i++) { await page.waitForTimeout(1500); if (await isLogged()) break; }
    if (await isLogged()) { HOLD = false; await ctx.storageState({ path: path.join(__dir, 'auth.json') }).catch(() => {}); setState('loggato', 'Login completato ✅'); return { ok: true, loggato: true, step: 'loggato', msg: 'Accesso eseguito ✅' }; }
    setState('attesa_otp', 'Codice non accettato — controlla e riprova, oppure invia un altro codice.');
    return { ok: false, loggato: false, step: 'attesa_otp', msg: 'Codice non accettato. Riprova oppure premi "Invia altro codice".' };
  } catch (e) { return { ok: false, step: LOGIN_STATE.step, msg: e.message }; }
  finally { BUSY = false; }
}

// SCHERMATA 2 → "Invia altro codice": chiede al portale un nuovo OTP via email.
async function doResend() {
  if (BUSY) return { ok: false, msg: 'Operazione in corso, attendi un istante.' };
  BUSY = true;
  try {
    await ensurePage();
    // La schermata OTP (IBM Security Verify) può stare in un iframe: controllo con
    // findOtpLocator, che guarda ANCHE i frame, non col solo documento principale.
    if (!(await otpField()) && !(await findOtpLocator())) return { ok: false, msg: 'La schermata OTP non è attiva: premi prima "Accedi".' };
    // Cerco il comando "invia un altro codice" in TUTTI i frame (il bottone prima
    // veniva cercato solo nel main → sul gateway in iframe non si trovava mai).
    // Escludo i pulsanti di conferma/avanti: manderebbero il codice invece di
    // richiederne uno nuovo. Allargo le diciture (IBM usa "Invia di nuovo",
    // "Invia nuovamente", "Non hai ricevuto il codice?", "Rigenera"…).
    let clicked = '';
    for (const fr of [page.mainFrame(), ...page.frames()]) {
      clicked = await fr.evaluate(() => {
        const vis = e => e && e.offsetParent !== null;
        const NO = /^\s*(conferma|continua|verifica|accedi|procedi|prosegui|avanti|login|entra|indietro|annulla)\s*$/i;
        const SI = /reinvia|rinvia|re-?invia|resend|nuovamente|rigenera|invia.*(altro|nuovo|di\s*nuovo).*codice|richiedi.*(nuovo.*)?codice|nuovo codice|non\s+hai\s+ricevut/i;
        const els = [...document.querySelectorAll('a,button,[role=button],input[type=submit],span,div,label')].filter(vis);
        const el = els.find(e => { const t = (e.innerText || e.value || '').trim(); return t && SI.test(t) && !NO.test(t); });
        if (el) { el.click(); return (el.innerText || el.value || '').trim(); }
        return '';
      }).catch(() => '');
      if (clicked) break;
    }
    await page.waitForTimeout(1500);
    if (clicked) { log('richiesto nuovo OTP:', clicked); return { ok: true, msg: 'Ho richiesto un nuovo codice ("' + clicked + '") — controlla l\'email.' }; }
    return { ok: false, msg: 'Non ho trovato il pulsante per un nuovo codice: forse ha un\'altra dicitura. Se serve, mappiamo il login.' };
  } catch (e) { return { ok: false, msg: e.message }; }
  finally { BUSY = false; }
}
// Compat: /login (usato da "Verifica accesso") avvia il login guidato fino alla schermata OTP.
async function autoLoginFlow() { return doAccedi(); }

// ── PREVENTIVO AUTO RCA via app "ISA" (Fast auto) ───────────────────────────────
// Flusso mappato dal manuale: ISA → Trattativa → Nuovo preventivo auto → targa → CREA →
// il sistema pesca il veicolo da ANIA e calcola il premio (prodotto Guidamica Autovetture).
const ISA_HOME = 'https://accedi.groupama.it/pda/PR_ISA';
// Frame col contenuto (ISA carica la UI in un frame interno): scelgo quello con più testo.
async function isaFrame() {
  let best = page.mainFrame(), n0 = 0;
  for (const fr of page.frames()) { const n = await fr.evaluate(() => (document.body && document.body.innerText || '').length).catch(() => 0); if (n > n0) { n0 = n; best = fr; } }
  return best;
}
// click NATIVO per testo nel frame dato (PrimeFaces/React ignorano i click sintetici). Come /explore.
async function clickByText(fr, t, postWait = 2200) {
  const cands = [fr.getByRole('menuitem', { name: t }), fr.getByRole('button', { name: t }), fr.getByRole('link', { name: t }), fr.getByText(t, { exact: true }), fr.getByText(t, { exact: false }), fr.locator(`text=${t}`)];
  for (const loc of cands) {
    try { const el = loc.first(); if (await el.count()) { await el.click({ timeout: 4500 }); await page.waitForTimeout(postWait); return true; } } catch (e) {}
  }
  return false;
}
const frameText = async (fr) => await fr.evaluate(() => document.body ? document.body.innerText : '').catch(() => '');
async function driveISAQuote(targa, opts) {
  QUOTING = true;
  try { return await _driveISAQuote(targa, opts || {}); }
  finally { QUOTING = false; }
}
// PACCHETTO garanzie Groupama (autovetture): Infortuni conducente via MII (sez. INF, unit INF05,
// fattore 3FINF=3 → tier 25k). Applica sull'asset della trattativa già quotata e ritorna lo stato.
// Il premio finale NON si legge qui (il JSON summary dà l'imponibile, non il lordo): si rilegge
// "Annuo Lordo" dalla pagina dopo il refresh, come per il preventivo base.
async function applyISAInfortuni(fr) {
  return fr.evaluate(async () => {
    const o = { steps: {} };
    try {
      let b = location.href.split('#')[0]; if (!b.endsWith('/')) b = b.slice(0, b.lastIndexOf('/') + 1);
      const J = async (m, p, body) => { try { const r = await fetch(b + p, { method: m, headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} return { status: r.status, text: t, json: j }; } catch (e) { return { error: String(e && e.message || e) }; } };
      const dealId = (location.hash.match(/(\d{6,})/) || [])[1] || null; o.dealId = dealId;
      if (!dealId) { o.err = 'dealId assente'; return o; }
      const deal = await J('GET', 'mii/deals/' + dealId);
      const quotCode = (deal.text && (deal.text.match(/mii:quotation:[0-9]+:[0-9]+/) || [])[0]) || null;
      if (!quotCode) { o.err = 'quotCode assente'; return o; }
      const summ = await J('GET', 'mii/products/' + quotCode + '/summary');
      let asset = (summ.text && (summ.text.match(/mii:ai:[0-9]+:[0-9]+/) || [])[0]) || null;
      if (!asset) { const ai = await J('GET', 'mii/products/' + quotCode + '/asset-instances'); asset = (ai.text && (ai.text.match(/mii:ai:[0-9]+:[0-9]+/) || [])[0]) || null; }
      if (!asset) { o.err = 'asset assente'; return o; }
      const codiceBene = (asset.match(/mii:ai:(\d+):/) || [])[1] || '000034';
      // Infortuni conducente: seleziona l'unit INF05, imposta il fattore massimale 3FINF=3 (25k)
      const sel = await J('POST', 'mii/execute/' + quotCode, { operationType: 'selectIstanzaUnit', codiceBene, codiceIstanzaBene: asset, codiceSezione: 'INF', codiceUnit: 'INF05' });
      const iu = (sel.text && (sel.text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) || []).pop()) || null;
      await J('POST', 'mii/execute/' + quotCode, { operationType: 'completaUnit', codiceBene, codiceIstanzaBene: asset });
      const setf = await J('POST', 'mii/execute/' + quotCode, { operationType: 'setFattoreUnit', codiceIstanzaBene: asset, codiceBene, codiceSezione: 'INF', codiceIstanzaUnit: iu, codiceUnit: 'INF05', param: { valore: 3, codice: '3FINF' } });
      await J('POST', 'mii/execute/' + quotCode, { operationType: 'completaUnit', codiceBene, codiceIstanzaBene: asset });
      await J('POST', 'mii/execute/' + quotCode, { operationType: 'setConvenzione', idConvenzione: 1510, properties: { codiceOperazione: 'Q00001', idPvcS: 20003028212 } });
      await J('GET', 'mii/v2/deals/' + dealId + '/refresh-state');
      o.ok = (sel.status === 200 && setf.status === 200); o.sel = sel.status; o.setf = setf.status; o.iu = iu;
    } catch (e) { o.err = String(e && e.message || e); }
    return o;
  }).catch(e => ({ err: String(e && e.message || e) }));
}
async function _driveISAQuote(targa, opts) {
  opts = opts || {};
  targa = String(targa || '').toUpperCase().replace(/\s+/g, '');
  if (!targa) return { ok: false, error: 'Targa mancante.' };
  await ensurePage();
  // apri l'app ISA, poi vado DIRETTO alla route "Fast auto" (più robusto del menu a tendina,
  // che ha problemi di timing con l'onClick React): #/trattativa/quotazione/nuova
  await page.goto(ISA_HOME, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2500);
  // Sessione scaduta? Provo il RE-LOGIN AUTOMATICO: con "ricorda 30 giorni" il portale NON richiede
  // l'OTP, quindi bastano utente+password e la sessione si rinnova da sola (l'utente non reinserisce
  // il codice ogni giorno). Se invece chiede l'OTP, mi fermo e chiedo il login manuale.
  if (await hasPasswordField()) {
    log('sessione ISA scaduta → re-login automatico (utente+password)…');
    const st = await doAccedi(); // QUI serve attendere: il preventivo continua solo dopo il re-login
    if (st.step !== 'loggato') return { ok: false, error: 'Sessione Groupama scaduta: rifai il login da QUOTO → Fonti → Groupama (poi resterà attiva 30 giorni).' };
    await page.goto(ISA_HOME, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(2500);
    if (await hasPasswordField()) return { ok: false, error: 'Sessione Groupama scaduta: rifai il login da Fonti → Groupama.' };
  }
  let fr = await isaFrame(), targaInput = null;
  for (let attempt = 0; attempt < 2 && !targaInput; attempt++) {
    await page.evaluate(() => { location.hash = '#/trattativa/quotazione/nuova'; }).catch(() => {});
    await page.waitForTimeout(2500);
    for (let i = 0; i < 10 && !targaInput; i++) {
      await page.waitForTimeout(1500);
      fr = await isaFrame();
      const cand = fr.locator('input[name="targa"]').first();
      if (await cand.count().catch(() => 0)) { try { await cand.waitFor({ state: 'visible', timeout: 1500 }); targaInput = cand; } catch (e) {} }
    }
    if (!targaInput) log('ISA nav tentativo ' + attempt + ': Fast auto non pronta, testo=' + (await frameText(fr)).slice(0, 80));
  }
  if (!targaInput) return { ok: false, error: 'Schermata "Fast auto" non raggiunta (input targa assente).', dump: (await frameText(await isaFrame())).slice(0, 250) };
  await targaInput.click({ force: true }).catch(() => {});
  await targaInput.fill(targa, { timeout: 5000, force: true });
  await page.waitForTimeout(500);
  fr = await isaFrame();
  await clickByText(fr, 'CREA');
  // attesa recupero ANIA + calcolo premio (fino ~55s)
  let body = '';
  for (let i = 0; i < 22; i++) {
    await page.waitForTimeout(2500);
    body = await frameText(await isaFrame());
    if (/Annuo Lordo/i.test(body) && /\d+,\d{2}\s*€/.test(body)) break;
  }
  if (!/Annuo Lordo/i.test(body)) return { ok: false, error: 'Premio non calcolato: veicolo non recuperato da ANIA o targa non valida per quotazione rapida (es. Voltura).', dump: (body || '').slice(0, 300) };
  const m0 = re => { const x = body.match(re); return x ? x[1].trim() : ''; };
  const premioBaseStr = m0(/Annuo Lordo\s*([\d.]+,\d{2})\s*€/i) || m0(/PREMIO[\s\S]{0,40}?([\d.]+,\d{2})\s*€/i);
  // NOTA garanzie: il Fast-auto quick-quote (Annuo Lordo) NON supporta le garanzie accessorie —
  // è un motore separato dalla trattativa MII. La sonda MII infortuni tariffa a €0 (unit/fattore
  // ancora da mappare), quindi il pacchetto Infortuni resta DISATTIVO di default per non mostrare
  // un premio fuorviante. Si abilita solo con ?infortuni=1 (diagnostica MII), vedi applyISAInfortuni.
  let infoGar = null;
  if (opts.infortuni === true) {
    infoGar = await applyISAInfortuni(await isaFrame());
  }
  const m = re => { const x = body.match(re); return x ? x[1].trim() : ''; };
  const premioStr = m(/Annuo Lordo\s*([\d.]+,\d{2})\s*€/i) || m(/PREMIO[\s\S]{0,40}?([\d.]+,\d{2})\s*€/i) || premioBaseStr;
  const num = premioStr ? parseFloat(premioStr.replace(/\./g, '').replace(',', '.')) : null;
  return {
    ok: !!num, targa,
    premio_annuale_num: num,
    premio_annuale: premioStr ? premioStr + ' €' : '',
    infortuni_diag: infoGar || null,
    garanzie_incluse: [],
    prodotto: m(/([^\n]*Autovetture\s*20\d\d[^\n]*)/i),
    marca: m(/Marca:\s*([^\n]+)/i),
    modello: m(/Modello:\s*([^\n]+)/i),
    valore_assicurato: m(/Valore Assicurato:\s*([\d.]+)/i),
    cu: m(/\bCU:\s*([^\n]+)/i),
    bm: m(/\bBM:\s*([^\n]+)/i),
  };
}

// Avvio: NON invio le credenziali da solo (eviterei di far partire un OTP prima che l'utente sia
// pronto). Controllo solo se la sessione persistente è già valida; altrimenti resto "pronto" e
// aspetto che l'utente avvii il login da QUOTO > Fonti (POST /login) → così l'OTP arriva quando
// lui sta guardando l'email e ha tutto il tempo di inserirlo.
(async () => {
  try {
    await ensurePage();
    if (await loggedIn()) { LOGIN_STATE = { running: false, step: 'loggato', since: Date.now(), msg: 'Sessione attiva' }; log('sessione persistente attiva ✅'); }
    else { LOGIN_STATE = { running: false, step: 'pronto', since: Date.now(), msg: 'Pronto: avvia il login da Fonti per ricevere l\'OTP' }; log('PRONTO al login — attendo /login dall\'utente (nessun OTP inviato finché non lo avvii)'); }
  } catch (e) { log('check iniziale err:', e.message); }
})();
// Keep-alive: tiene viva la sessione del portale E quella di ISA (che ha un timeout di inattività
// suo: prima scadeva ISA pur restando "loggato" il guscio, costringendo a reinserire l'OTP). Ogni
// ~4 min pingo a turno la home portale e la home ISA, così l'utente NON deve rifare il codice ogni
// giorno. MAI durante login (running/HOLD/BUSY) o durante un preventivo (QUOTING).
let kaTick = 0;
setInterval(async () => {
  if (LOGIN_STATE.running || inAttesaCodice() || BUSY || QUOTING) return;
  try {
    await ensurePage();
    // ISA scade per inattività molto prima del guscio. Prima alternavo ISA e portale:
    // ISA veniva pingata solo ogni 8 min e poteva scadere nel mezzo → "devo rifare il
    // codice ogni giorno". Ora tengo viva ISA a OGNI giro (4 min) e ogni tanto rinfresco
    // anche il guscio, che scade molto più lentamente.
    await page.goto(ISA_HOME, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1800);
    const isaPwd = await hasPasswordField();
    if (!isaPwd && (kaTick++ % 3 === 0)) {
      await page.goto(creds().loginUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(1500);
    }
    // se ISA/portale ha buttato fuori (compare la password) segnalo subito lo stato scaduto
    if (isaPwd || await hasPasswordField()) { LOGIN_STATE = { running: false, step: 'pronto', since: Date.now(), msg: 'Sessione scaduta: rifai il login da Fonti → Groupama' }; }
  } catch (e) {}
}, 4 * 60 * 1000);

// ── HTTP: telecomando (stesso stile degli altri scraper) ───────────────────────
http.createServer(async (req, res) => {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname.startsWith('/status')) {
      /* /status deve rispondere SEMPRE in fretta: e' la domanda "come stai?"
         che pannello, guardiano e diagnosi fanno di continuo. loggedIn() guida
         il browser e puo' metterci quasi un minuto; scaduto il tempo si
         risponde "non lo so" (null), che e' l'unica cosa onesta. */
      const loggato = await entroTempo(() => loggedIn(), 4000, null);
      const c = creds();
      return res.end(JSON.stringify({ url: page.url(), loggato, login_step: LOGIN_STATE.step, login_running: LOGIN_STATE.running, ha_credenziali: !!(c.username && c.password), login_msg: LOGIN_STATE.msg || '', codice_in_attesa: !!(c.codice && (Date.now() - c.codice_ts) < 20 * 60 * 1000) }));
    }
    // ATTENZIONE: /loginstate va controllato PRIMA di /login (altrimenti '/loginstate'.startsWith('/login')
    // farebbe ripartire il login ad ogni polling dello stato → restava bloccato su 'start').
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
      // Compat "Verifica accesso": avvia il login guidato fino alla schermata OTP (SINCRONO).
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
    if (u.pathname.startsWith('/sniff/start')) {
      sniffStart();
      return res.end(JSON.stringify({ ok: true, recording: true, msg: 'Cattura avviata. Fai il preventivo a mano nel browser del server (VNC), poi premi "Ferma e leggi".' }));
    }
    if (u.pathname.startsWith('/sniff/stop')) {
      const buf = sniffStop();
      return res.end(JSON.stringify({ ok: true, recording: false, captured: buf.length, calls: buf }, null, 2));
    }
    if (u.pathname.startsWith('/explore')) {
      const g = k => u.searchParams.get(k) || '';
      const doSniff = g('sniff') === '1';
      if (doSniff) sniffStart();
      const before = ctx.pages().length;
      if (g('goto')) { let p = g('goto'); if (!/^https?:/i.test(p)) p = origin(creds().loginUrl) + (p.startsWith('/') ? p : '/' + p); await page.goto(p, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}); await page.waitForTimeout(2500); }
      // Il portale incapsula i contenuti in IFRAME: scelgo il frame con più contenuto (o per nome).
      const pickFrame = async () => {
        const want = g('frame');
        const frames = page.frames();
        if (want) { const f = frames.find(fr => (fr.url() || '').toLowerCase().includes(want.toLowerCase())); if (f) return f; }
        let best = page.mainFrame(), bestLen = 0;
        for (const fr of frames) { const n = await fr.evaluate(() => (document.body && document.body.innerText || '').length).catch(() => 0); if (n > bestLen) { bestLen = n; best = fr; } }
        return best;
      };
      let fr = await pickFrame();
      // hover NATIVO: apre i mega-menu PrimeFaces (gli eventi sintetici vengono ignorati)
      if (g('hover')) { try { await fr.getByText(g('hover'), { exact: false }).first().hover({ timeout: 4000 }); } catch (e) {} await page.waitForTimeout(1500); }
      // click NATIVO: PrimeFaces/JSF rispondono solo ai click reali di Playwright (trusted events).
      if (g('click')) {
        const t = g('click');
        const cands = [fr.getByRole('button', { name: t }), fr.getByRole('link', { name: t }), fr.getByRole('menuitem', { name: t }), fr.getByText(t, { exact: true }), fr.getByText(t, { exact: false }), fr.locator(`text=${t}`)];
        for (const loc of cands) { try { const el = loc.first(); if (await el.count()) { await el.click({ timeout: 4500 }); break; } } catch (e) {} }
        await page.waitForTimeout(2800);
      }
      if (g('href')) { try { await fr.locator('a[href*="' + g('href') + '" i]').first().click({ timeout: 4500 }); } catch (e) {} await page.waitForTimeout(2800); }
      // fill NATIVO (React/MUI ignorano il value sintetico): targetizzo per selettore o primo input testo.
      if (g('fill')) {
        const val = g('fill');
        const sel = g('fillsel') || 'input[name="targa"], input[type=text]:visible, input:not([type]):visible, input[type=search]:visible';
        try { const el = fr.locator(sel).first(); await el.click({ timeout: 3000, force: true }).catch(() => {}); await el.fill(val, { timeout: 5000, force: true }); } catch (e) {
          // fallback: native setter + eventi React
          await fr.evaluate(({ sel, v }) => { const i = document.querySelector(sel.split(',')[0]) || [...document.querySelectorAll('input')].find(x => x.offsetParent !== null); if (i) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); } }, { sel, v: val }).catch(() => {});
        }
        await page.waitForTimeout(800);
      }
      // se la navigazione ha aperto una NUOVA scheda (le app del portale spesso lo fanno), passo a quella
      const pgs = ctx.pages();
      if (pgs.length > before) { const np = pgs[pgs.length - 1]; if (np && !np.isClosed()) { page = np; await page.waitForLoadState('domcontentloaded').catch(() => {}); await page.waitForTimeout(1500); fr = await pickFrame(); } }
      const all = g('all') === '1'; // includi anche link nascosti (sottomenu) con href
      const dump = await fr.evaluate((all) => {
        const vis = e => e && e.offsetParent !== null;
        const fields = [...document.querySelectorAll('input,select')].filter(vis).slice(0, 60).map(e => ({ tag: e.tagName.toLowerCase(), type: e.type || '', id: e.id || '', name: e.name || '', placeholder: e.placeholder || '' }));
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
      const buf = await page.screenshot({ fullPage: false }).catch(() => null);
      if (!buf) return res.end(JSON.stringify({ error: 'screenshot fallito' }));
      res.setHeader('content-type', 'image/png'); return res.end(buf);
    }
    if (u.pathname.startsWith('/nexus-probe')) {
      // DIAGNOSTICA Nexus (altri veicoli): apre l'emissione, prova a scegliere Tipo
      // Prodotto=Auto + Prodotto=Guidamica Veicoli guidando l'ajax RichFaces, e traccia
      // lo stato a ogni stadio (abilitazioni, valori, messaggi, comparsa Tipo Veicolo/
      // Targa). Modalità pilotaggio: ?mode=selectOption (default) | onchange | a4j.
      // NON inserisce targhe, NON interroga ANIA, NON salva niente.
      try {
        const mode = u.searchParams.get('mode') || 'selectOption';
        const trace = [];
        const snap = async (tag) => {
          const s = await page.evaluate(() => {
            const q = sel => document.querySelector(sel);
            const opt = s => s ? [...s.options].slice(0, 40).map(o => ({ v: o.value, t: (o.textContent || '').trim() })) : null;
            const tipo = q('select[id$="lstTipoProdotto"]');
            const prod = q('select[id$="lstProdotto"]');
            // Tipo Veicolo / Targa / ANIA: cerco per pezzo di id (non conosco ancora il nome esatto)
            const veic = [...document.querySelectorAll('select')].find(s => /veicol/i.test(s.id));
            const targa = [...document.querySelectorAll('input')].find(i => /targa/i.test(i.id) && i.type !== 'hidden');
            const ania = [...document.querySelectorAll('input[type=checkbox],input[type=radio]')].find(i => /ania/i.test(i.id));
            const msgEl = document.body.innerText || '';
            const msg = (msgEl.match(/Area messaggi[\s\S]{0,240}/) || [''])[0];
            return {
              url: location.href, a4j: typeof window.A4J,
              tipoEnabled: tipo ? !tipo.disabled : null, tipoVal: tipo ? tipo.value : null,
              tipoOnchange: tipo ? (tipo.getAttribute('onchange') || '').slice(0, 300) : null,
              prodEnabled: prod ? !prod.disabled : null, prodVal: prod ? prod.value : null, prodOpt: opt(prod),
              prodOnchange: prod ? (prod.getAttribute('onchange') || '').slice(0, 200) : null,
              veicId: veic ? veic.id : null, veicOpt: opt(veic),
              targaId: targa ? targa.id : null, aniaId: ania ? ania.id : null,
              msg,
            };
          }).catch(e => ({ err: e.message }));
          trace.push({ tag, ...s });
        };
        const idle = () => page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        // pilota un select: per valore, oppure invocando l'onchange, oppure A4J diretto
        const guida = async (idSuffix, val) => {
          if (mode === 'selectOption') {
            try { await page.locator('select[id$="' + idSuffix + '"]').first().selectOption(val); return 'selectOption'; }
            catch (e) { return 'selErr:' + e.message.slice(0, 80); }
          }
          return await page.evaluate(({ suf, v, m }) => {
            const s = document.querySelector('select[id$="' + suf + '"]'); if (!s) return 'no-select';
            // seleziono l'option per valore (imposta anche selectedIndex, non solo .value)
            let hit = false;
            for (const o of s.options) { if (o.value === v) { o.selected = true; hit = true; break; } }
            s.value = v;
            if (!hit) return 'valore-non-in-lista:' + v;
            if (m === 'a4j') {
              // replay FEDELE: eseguo la stringa dell'attributo onchange (contiene A4J.AJAX.Submit(...))
              const oc = s.getAttribute('onchange');
              if (!oc) return 'no-onchange-attr';
              try {
                const fn = new Function('event', oc);
                fn.call(s, { type: 'change', target: s, srcElement: s });
                return 'a4j-attr-eval';
              } catch (e) { return 'a4jErr:' + e.message; }
            }
            if (m === 'onchange' && typeof s.onchange === 'function') { try { s.onchange({ type: 'change', target: s, srcElement: s }); return 'onchange-fn'; } catch (e) { return 'onchangeErr:' + e.message; } }
            s.dispatchEvent(new Event('change', { bubbles: true }));
            return 'dispatch';
          }, { suf: idSuffix, v: val, m: mode });
        };
        const NB = 'https://accedi.groupama.it/pda/PR_GCP_nexus-web/';
        await page.goto(NB, { waitUntil: 'domcontentloaded', timeout: 45000 }); await page.waitForTimeout(2500);
        try { await page.getByText('Portafoglio', { exact: false }).first().hover({ timeout: 4000 }); } catch (e) {}
        await page.waitForTimeout(1000);
        try { await page.getByText('Nuova Proposta', { exact: true }).first().click({ timeout: 6000 }); } catch (e) {}
        await page.waitForTimeout(3500);
        await snap('apertura');
        if (mode === 'xhr') {
          // GROUND TRUTH: intercetto XHR/fetch, poi provo a far scattare l'ajax del Tipo
          // Prodotto con una VERA transizione di valore (vuoto → Auto) e leggo la risposta
          // del server (se ri-abilita lstProdotto o mostra i campi veicolo).
          await page.evaluate(() => {
            window.__xhrlog = [];
            const O = XMLHttpRequest.prototype.open, S = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.open = function (m, u) { this.__m = m; this.__u = u; return O.apply(this, arguments); };
            XMLHttpRequest.prototype.send = function (b) {
              const rec = { m: this.__m, u: (this.__u || '').slice(0, 140), body: (typeof b === 'string' ? b : '').slice(0, 600), status: null, respLen: null, hints: null, snippet: null };
              this.addEventListener('loadend', () => {
                try {
                  rec.status = this.status; const t = this.responseText || ''; rec.respLen = t.length;
                  rec.hints = { lstProdotto: /lstProdotto/.test(t), prodEnabledInResp: /lstProdotto[^>]*?>[\s\S]{0,40}/.test(t) && !/lstProdotto[^>]*disabled/i.test(t), veicolo: /[Vv]eicol/.test(t), targa: /[Tt]arga/.test(t), ania: /ania/i.test(t), obblig: /obbligatori/i.test(t) };
                  rec.snippet = t.slice(0, 400);
                } catch (e) { rec.err = String(e && e.message || e); }
              });
              window.__xhrlog.push(rec);
              return S.apply(this, arguments);
            };
          }).catch(() => {});
          const fireTipo = async (v) => page.evaluate((val) => {
            const s = document.querySelector('select[id$="lstTipoProdotto"]'); if (!s) return 'no-select';
            for (const o of s.options) o.selected = (o.value === val);
            s.value = val;
            const oc = s.getAttribute('onchange'); if (!oc) return 'no-oc';
            try { new Function('event', oc).call(s, { type: 'change', target: s, srcElement: s }); return 'fired:' + val; } catch (e) { return 'err:' + e.message; }
          }, v);
          trace.push({ tag: 'fire-tipo-1(as-is)', esito: await fireTipo('1') });
          await idle(); await page.waitForTimeout(2500); await snap('dopo-1');
          trace.push({ tag: 'fire-tipo-blank', esito: await fireTipo('') });
          await idle(); await page.waitForTimeout(2500); await snap('dopo-blank');
          trace.push({ tag: 'fire-tipo-1(riseleziona)', esito: await fireTipo('1') });
          await idle(); await page.waitForTimeout(2800); await snap('dopo-riseleziona');
          const xhrlog = await page.evaluate(() => window.__xhrlog || []).catch(() => []);
          return res.end(JSON.stringify({ mode, trace, xhrlog }, null, 2));
        }
        if (mode === 'forceprod') {
          // Test decisivo: registro Tipo Prodotto=Auto, poi FORZO l'abilitazione del select
          // Prodotto, scelgo "Guidamica - Veicoli" e faccio scattare il SUO onchange. Vedo se il
          // server scopre i campi veicolo (Tipo Veicolo/Targa/ANIA) SENZA contraente, o se li nega.
          await page.evaluate(() => {
            window.__xhrlog = [];
            const O = XMLHttpRequest.prototype.open, S = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.open = function (m, u) { this.__m = m; this.__u = u; return O.apply(this, arguments); };
            XMLHttpRequest.prototype.send = function (b) {
              const rec = { m: this.__m, body: (typeof b === 'string' ? b : '').slice(0, 240), status: null, respLen: null, hints: null, veicRegion: null };
              this.addEventListener('loadend', () => {
                try {
                  rec.status = this.status; const t = this.responseText || ''; rec.respLen = t.length;
                  rec.hints = { veicolo: /[Vv]eicol/.test(t), tipoVeicolo: /[Tt]ipo\s*[Vv]eicolo|lstTipoVeicolo|TipoVeicolo/.test(t), targa: /[Tt]arga/.test(t), ania: /ania/i.test(t), obblig: /obbligatori/i.test(t), contraente: /[Cc]ontraente/.test(t) };
                  const m = t.search(/[Tt]ipo\s*[Vv]eicolo|lstTipoVeicolo|[Tt]arga|richiestaAnia/);
                  rec.veicRegion = m >= 0 ? t.slice(Math.max(0, m - 120), m + 260).replace(/\s+/g, ' ') : null;
                  const mo = t.search(/obbligatori/i); rec.obbligRegion = mo >= 0 ? t.slice(Math.max(0, mo - 100), mo + 80).replace(/\s+/g, ' ') : null;
                } catch (e) { rec.err = String(e && e.message || e); }
              });
              window.__xhrlog.push(rec);
              return S.apply(this, arguments);
            };
          }).catch(() => {});
          // 1) registro Tipo Prodotto=Auto
          trace.push({ tag: 'fire-tipo', esito: await page.evaluate(() => {
            const s = document.querySelector('select[id$="lstTipoProdotto"]'); if (!s) return 'no-select';
            for (const o of s.options) o.selected = (o.value === '1'); s.value = '1';
            const oc = s.getAttribute('onchange'); try { new Function('event', oc).call(s, { type: 'change', target: s, srcElement: s }); return 'ok'; } catch (e) { return 'err:' + e.message; } }) });
          await idle(); await page.waitForTimeout(2500);
          // 2) forzo abilitazione + scelgo Guidamica Veicoli + scateno il suo onchange
          trace.push({ tag: 'force-prod', esito: await page.evaluate(() => {
            const p = document.querySelector('select[id$="lstProdotto"]'); if (!p) return 'no-prod';
            const wasDisabled = p.disabled; p.disabled = false; p.removeAttribute('disabled');
            let hit = false; for (const o of p.options) { if (o.value === '000518-V00001') { o.selected = true; hit = true; } else o.selected = false; }
            p.value = '000518-V00001';
            const oc = p.getAttribute('onchange'); let fired = 'no-oc';
            if (oc) { try { new Function('event', oc).call(p, { type: 'change', target: p, srcElement: p }); fired = 'fired'; } catch (e) { fired = 'err:' + e.message; } }
            return 'wasDisabled=' + wasDisabled + ' hit=' + hit + ' ' + fired; }) });
          await idle(); await page.waitForTimeout(3000); await snap('dopo-prod-forzato');
          const xhrlog = await page.evaluate(() => window.__xhrlog || []).catch(() => []);
          return res.end(JSON.stringify({ mode, trace, xhrlog }, null, 2));
        }
        if (mode === 'contraente') {
          // Scopro il meccanismo del CONTRAENTE senza click reali (che aprono modali native e
          // bloccano il driver headless): leggo l'onclick del pulsante "Ricerca", intercetto
          // l'XHR e faccio partire l'ajax A4J, poi leggo dalla RISPOSTA il form anagrafica
          // (campi CF, opzione occasionale) e rileggo il DOM del pannello modale ri-renderizzato.
          await page.evaluate(() => {
            window.__xhrlog = [];
            const O = XMLHttpRequest.prototype.open, S = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; return O.apply(this, arguments); };
            XMLHttpRequest.prototype.send = function (b) {
              const rec = { status: null, respLen: null, hints: null, occReg: null, cfReg: null };
              this.addEventListener('loadend', () => {
                try {
                  rec.status = this.status; const t = this.responseText || ''; rec.respLen = t.length;
                  rec.hints = { occasional: /occasional/i.test(t), soggetto: /soggetto/i.test(t), codiceFiscale: /codice\s*fiscale|codiceFiscale|CodFisc/i.test(t), partitaIva: /partita\s*iva|partitaIva|PartitaIva/i.test(t), ricercaAnag: /anagrafic/i.test(t), nuovo: /nuov[ao]/i.test(t) };
                  const io = t.search(/occasional/i); rec.occReg = io >= 0 ? t.slice(Math.max(0, io - 160), io + 200).replace(/\s+/g, ' ') : null;
                  const ic = t.search(/codice\s*fiscale|codiceFiscale/i); rec.cfReg = ic >= 0 ? t.slice(Math.max(0, ic - 100), ic + 200).replace(/\s+/g, ' ') : null;
                } catch (e) { rec.err = String(e && e.message || e); }
              });
              window.__xhrlog.push(rec);
              return S.apply(this, arguments);
            };
          }).catch(() => {});
          // leggo e faccio partire l'onclick del pulsante Ricerca (A4J), senza click nativo
          trace.push({ tag: 'fire-ricerca', esito: await page.evaluate(() => {
            const b = document.querySelector('[id$="ricercaAnagraficaContraente"]'); if (!b) return 'no-btn';
            const oc = b.getAttribute('onclick') || ''; const info = 'onclick=' + oc.slice(0, 160);
            try { if (oc) { new Function('event', oc).call(b, { type: 'click', target: b, srcElement: b }); return 'fired | ' + info; } return 'no-onclick | ' + info; } catch (e) { return 'err:' + e.message + ' | ' + info; }
          }) });
          await idle(); await page.waitForTimeout(3500);
          // rileggo il DOM: campi/pulsanti ora visibili nel pannello anagrafica + testo occasionale
          const dom = await page.evaluate(() => {
            const vis = e => e && e.offsetParent !== null;
            const inputs = [...document.querySelectorAll('input,select,textarea')].filter(vis).slice(0, 60).map(e => ({ tag: e.tagName.toLowerCase(), type: e.type || '', id: (e.id || '').slice(-48), ph: e.placeholder || '' }));
            const btns = [...document.querySelectorAll('a,button,[role=button],input[type=submit],input[type=button]')].filter(vis).slice(0, 80).map(e => ({ t: (e.innerText || e.title || e.value || '').trim().slice(0, 38), id: (e.id || '').slice(-48) })).filter(x => x.t || x.id);
            const bt = document.body.innerText || '';
            const occ = (bt.match(/[^\n]{0,50}(occasional|soggetto occasion|anagrafic)[^\n]{0,80}/i) || [''])[0];
            return { url: location.href, occ, inputs, btns };
          }).catch(e => ({ err: e.message }));
          trace.push({ tag: 'dopo-fire', ...dom });
          const xhrlog = await page.evaluate(() => window.__xhrlog || []).catch(() => []);
          return res.end(JSON.stringify({ mode, trace, xhrlog }, null, 2));
        }
        trace.push({ tag: 'guida-tipo', modo: mode, esito: await guida('lstTipoProdotto', '1') });
        await idle(); await page.waitForTimeout(1800);
        await snap('dopo-tipo');
        const prodOn = await page.evaluate(() => { const p = document.querySelector('select[id$="lstProdotto"]'); return p ? !p.disabled : false; });
        if (prodOn) {
          trace.push({ tag: 'guida-prod', esito: await guida('lstProdotto', '000518-V00001') });
          await idle(); await page.waitForTimeout(2200);
          await snap('dopo-prodotto');
        } else {
          trace.push({ tag: 'prod-ancora-disabled' });
        }
        return res.end(JSON.stringify({ mode, trace }, null, 2));
      } catch (e) { return res.end(JSON.stringify({ error: e.message })); }
    }
    if (u.pathname.startsWith('/miiprobe')) {
      // SONDA #18: dopo il preventivo, scopre gli ID MII e prova ad aggiungere l'Infortuni
      // conducente (sez. INF, unit INF05, fattore 3FINF=3) via /mii/execute, poi rilegge il
      // premio da /summary. Serve a capire base MII, auth e delta premio senza toccare /premio.
      const targa = (u.searchParams.get('targa') || '').toUpperCase().trim();
      const base = await driveISAQuote(targa);
      if (!base.ok) return res.end(JSON.stringify({ ok: false, fase: 'preventivo', base }, null, 2));
      const fr = await isaFrame();
      const probe = await fr.evaluate(async () => {
        const o = { url: location.href, steps: {} };
        try {
          let b = location.href.split('#')[0]; if (!b.endsWith('/')) b = b.slice(0, b.lastIndexOf('/') + 1);
          o.base = b;
          const J = async (m, p, body) => { try { const r = await fetch(b + p, { method: m, headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} return { status: r.status, len: t.length, text: t, json: j }; } catch (e) { return { error: String(e && e.message || e) }; } };
          const dealId = (location.hash.match(/(\d{6,})/) || [])[1] || null; o.dealId = dealId;
          if (!dealId) { o.steps.deal = 'dealId non trovato in hash'; return o; }
          const deal = await J('GET', 'mii/deals/' + dealId);
          o.steps.deal = { status: deal.status };
          const quotCode = (deal.text && (deal.text.match(/mii:quotation:[0-9]+:[0-9]+/) || [])[0]) || null;
          o.quotCode = quotCode;
          if (!quotCode) { o.steps.ids = 'quotCode non trovato'; return o; }
          const premi = (txt) => { const out = {}; const re = /"([a-zA-Z]*(?:premio|lordo|totale|netto|imponibile|annuo)[a-zA-Z]*)"\s*:\s*"?([\d.,]+)"?/gi; let m, n = 0; while ((m = re.exec(txt || '')) && n < 30) { out[m[1]] = m[2]; n++; } return out; };
          const summ0 = await J('GET', 'mii/products/' + quotCode + '/summary');
          o.steps.summary0 = { status: summ0.status, premi: premi(summ0.text), hasINF: /"INF"|Infortuni/i.test(summ0.text || '') };
          // cerco l'asset-instance in: summary → prodotto (withValidationDN) → lista asset-instances
          let asset = (summ0.text && (summ0.text.match(/mii:ai:[0-9]+:[0-9]+/) || [])[0]) || null; let assetSrc = asset ? 'summary' : '';
          if (!asset) { const pr = await J('GET', 'mii/products/withValidationDN/' + quotCode + '?version=V00001'); o.steps.product = { status: pr.status }; asset = (pr.text && (pr.text.match(/mii:ai:[0-9]+:[0-9]+/) || [])[0]) || null; if (asset) assetSrc = 'product'; }
          if (!asset) { const ai = await J('GET', 'mii/products/' + quotCode + '/asset-instances'); o.steps.assetList = { status: ai.status }; asset = (ai.text && (ai.text.match(/mii:ai:[0-9]+:[0-9]+/) || [])[0]) || null; if (asset) assetSrc = 'asset-instances'; }
          o.asset = asset; o.assetSrc = assetSrc;
          if (!asset) { o.steps.ids = 'asset non trovato (summary/product/list)'; return o; }
          const codiceBene = (asset.match(/mii:ai:(\d+):/) || [])[1] || '000034';
          // Infortuni = DUE istanze INF05 (morte + invalidità), ciascuna con 3FINF=3
          o.istanzeUnit = [];
          for (let k = 0; k < 2; k++) {
            const sel = await J('POST', 'mii/execute/' + quotCode, { operationType: 'selectIstanzaUnit', codiceBene, codiceIstanzaBene: asset, codiceSezione: 'INF', codiceUnit: 'INF05' });
            const iu = (sel.text && (sel.text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) || []).pop()) || null;
            o.istanzeUnit.push({ sel: sel.status, iu });
            // DIAGNOSTICA (solo prima istanza): estraggo i fattori dell'unit INF05 dalla risposta —
            // cerco il fattore CAPITALE/massimale (quello che tariffa l'infortuni, ora €0 con solo 3FINF).
            if (k === 0) {
              const codes = [...new Set((sel.text || '').match(/"codice"\s*:\s*"([0-9A-Z]{3,8})"/g) || [])].slice(0, 40);
              const fattori = [];
              const re = /"codiceFattore"\s*:\s*"([^"]+)"[^}]*?"descrizione"\s*:\s*"([^"]{0,50})"|"codice"\s*:\s*"(3F[^"]+|3[A-Z]{2,}[^"]*)"[^}]*?"descrizione"\s*:\s*"([^"]{0,50})"/g;
              let m, n = 0; while ((m = re.exec(sel.text || '')) && n < 30) { fattori.push({ cod: m[1] || m[3], desc: (m[2] || m[4] || '').slice(0, 40) }); n++; }
              o.selUnitCodes = codes.map(c => c.replace(/.*"([^"]+)"$/, '$1'));
              o.selUnitFattori = fattori;
              o.selRaw = (sel.text || '').slice(0, 1200);
            }
            await J('POST', 'mii/execute/' + quotCode, { operationType: 'completaUnit', codiceBene, codiceIstanzaBene: asset });
            const setf = await J('POST', 'mii/execute/' + quotCode, { operationType: 'setFattoreUnit', codiceIstanzaBene: asset, codiceBene, codiceSezione: 'INF', codiceIstanzaUnit: iu, codiceUnit: 'INF05', param: { valore: 3, codice: '3FINF' } });
            o.istanzeUnit[k].setf = setf.status;
            await J('POST', 'mii/execute/' + quotCode, { operationType: 'completaUnit', codiceBene, codiceIstanzaBene: asset });
          }
          // convenzione come nella cattura (idPvcS dell'agenzia)
          await J('POST', 'mii/execute/' + quotCode, { operationType: 'setConvenzione', idConvenzione: 1510, properties: { codiceOperazione: 'Q00001', idPvcS: 20003028212 } });
          // refresh stato trattativa + attesa prima di rileggere il premio
          await J('GET', 'mii/v2/deals/' + dealId + '/refresh-state');
          await new Promise(r => setTimeout(r, 4000));
          const summ1 = await J('GET', 'mii/products/' + quotCode + '/summary');
          o.steps.summary1 = { status: summ1.status, premi: premi(summ1.text), hasINF: /"INF"|Infortuni/i.test(summ1.text || '') };
          // estraggo i campi numerici di body (lì c'è il totale lordo) da summary0 e summary1
          const bodyNums = (sj) => { const b = sj && sj.body; const out = {}; if (b && typeof b === 'object') for (const k of Object.keys(b)) { const v = b[k]; if (typeof v === 'number') out[k] = v; } return out; };
          o.body0 = bodyNums(summ0.json); o.body1 = bodyNums(summ1.json);
          o.body1_keys = summ1.json && summ1.json.body ? Object.keys(summ1.json.body) : null;
          // sezioni/rischi con premio (per vedere INF e il suo netto)
          const sezPrem = (sj) => { const t = JSON.stringify(sj || {}); const out = []; const re = /"(codiceSezione|codice|descrizione)"\s*:\s*"(INF[^"]*|RCA[^"]*)"[^}]{0,200}?"(netto|premio|lordo)"\s*:\s*([\d.]+)/gi; let m, n = 0; while ((m = re.exec(t)) && n < 12) { out.push(m[2] + ':' + m[3] + '=' + m[4]); n++; } return out; };
          o.sez1 = sezPrem(summ1.json);
        } catch (e) { o.error = String(e && e.message || e); }
        return o;
      }).catch(e => ({ error: String(e && e.message || e) }));
      return res.end(JSON.stringify({ ok: true, premio_base: base.premio_annuale, probe }, null, 2));
    }
    if (u.pathname.startsWith('/premio')) {
      // Preventivo auto RCA via ISA: ?targa=GY263BY  (?infortuni=1 = diagnostica MII, tariffa €0 WIP)
      const targa = (u.searchParams.get('targa') || '').toUpperCase().trim();
      const infortuni = u.searchParams.get('infortuni') === '1';
      const r = await driveISAQuote(targa, { infortuni });
      return res.end(JSON.stringify(r));
    }
    res.statusCode = 404; return res.end(JSON.stringify({ error: 'endpoint sconosciuto' }));
  } catch (e) { res.statusCode = 500; return res.end(JSON.stringify({ error: e.message })); }
}).listen(PORT, '127.0.0.1', () => log('telecomando HTTP su 127.0.0.1:' + PORT));
