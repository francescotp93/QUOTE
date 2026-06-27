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
  return chromium.launchPersistentContext(userDataDir, {
    headless: false, viewport: null, locale: 'it-IT',
    args: ['--no-sandbox', '--start-maximized', '--disable-blink-features=AutomationControlled'],
  });
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

const isLoginUrl = (url) => /login|signin|accedi|auth|sso|index\.xhtml/i.test(url || '');
async function hasPasswordField() { return await page.$('input[type=password]').then(e => !!e).catch(() => false); }
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
  for (const re of [/^\s*conferma\s*$/i, /^\s*continua\s*$/i, /^\s*verifica\s*$/i, /^\s*accedi\s*$/i, /^\s*prosegui\s*$/i, /^\s*procedi\s*$/i]) {
    const b = page.getByRole('button', { name: re }).first();
    try { if (await b.count()) { await b.click({ timeout: 4000 }); return true; } } catch (e) {}
  }
  return false;
}
// Spunta un eventuale "ricorda questo dispositivo / fidati" per evitare l'OTP nei login futuri.
async function trustDevice() {
  await page.evaluate(() => {
    const vis = e => e && e.offsetParent !== null;
    for (const cb of [...document.querySelectorAll('input[type=checkbox]')].filter(vis)) {
      const lbl = ((cb.closest('label,div,form') || {}).innerText || '') + ' ' + (cb.name || '') + ' ' + (cb.id || '');
      if (/ricorda|fidat|trust|dispositivo|device|non chiedere/i.test(lbl) && !cb.checked) cb.click();
    }
  }).catch(() => {});
}

// AUTO-LOGIN con OTP: gira IN BACKGROUND (può durare minuti in attesa del codice via email).
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
      // Attende l'esito del submit fino ~28s: o compare la pagina OTP, o si logga direttamente.
      // (La pagina OTP di Groupama/IBM ci mette qualche secondo a comparire: un check singolo la perdeva.)
      for (let i = 0; i < 14; i++) {
        await page.waitForTimeout(2000);
        if (await otpField()) break;
        if (!isLoginUrl(page.url()) && !(await hasPasswordField())) break;
      }
    }
    // 2) OTP: attende la pagina del codice, poi POLLA il codice dal Pannello Fonti
    if (await otpField()) {
      LOGIN_STATE.step = 'attesa_otp';
      LOGIN_STATE.msg = 'Credenziali OK — inserisci il codice OTP ricevuto via email';
      log('pagina OTP rilevata: CREDENZIALI OK. Attendo il codice da QUOTO > Fonti > Groupama (fino a 20 min)');
      const t0 = Date.now();
      const startCodTs = creds().codice_ts || 0;
      let lastSubmitTs = startCodTs; // NON ri-inviare lo stesso codice (causava OTP a raffica)
      let submitted = false;
      while (Date.now() - t0 < 20 * 60 * 1000) {
        await page.waitForTimeout(3000);
        // login completato nel frattempo (es. inserito via VNC)?
        if (!isLoginUrl(page.url()) && !(await hasPasswordField()) && !(await otpField())) { submitted = true; break; }
        const cc = creds();
        // SOLO un codice NUOVO (ts maggiore dell'ultimo già inviato) → si invia UNA volta sola
        if (cc.codice && cc.codice_ts > lastSubmitTs && (Date.now() - cc.codice_ts) < 20 * 60 * 1000) {
          lastSubmitTs = cc.codice_ts;
          LOGIN_STATE.step = 'invio_otp';
          log('codice ricevuto → lo inserisco (una volta)');
          // fill NATIVO del campo OTP (il primo input testo/number visibile sulla pagina /authsvc)
          try { await page.locator('input[type=text]:visible, input[type=tel]:visible, input[type=number]:visible, input:not([type]):visible').first().fill(cc.codice, { timeout: 5000 }); } catch (e) { log('fill OTP err:', e.message); }
          await trustDevice();
          await page.waitForTimeout(400);
          await clickConfirm(); // SOLO "Conferma" — MAI Invio/"Invia altro codice"
          await page.waitForTimeout(5000);
          if (!isLoginUrl(page.url()) && !(await hasPasswordField()) && !(await otpField())) { submitted = true; break; }
          // codice errato/scaduto: torno ad attendere un NUOVO codice (non ri-invio questo)
          LOGIN_STATE.step = 'attesa_otp';
        }
      }
      if (!submitted) { LOGIN_STATE = { running: false, step: 'timeout_otp', since: Date.now(), msg: 'Codice OTP non ricevuto in tempo' }; return LOGIN_STATE; }
    }
    const ok = !isLoginUrl(page.url()) && !(await hasPasswordField()) && !(await otpField());
    if (ok) { await ctx.storageState({ path: path.join(__dir, 'auth.json') }).catch(() => {}); }
    LOGIN_STATE = { running: false, step: ok ? 'loggato' : 'non_loggato', since: Date.now(), msg: ok ? 'Login completato' : 'Login non riuscito (verifica credenziali/codice)' };
    return LOGIN_STATE;
  } catch (e) {
    LOGIN_STATE = { running: false, step: 'error', since: Date.now(), msg: e.message };
    return LOGIN_STATE;
  }
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
      return res.end(JSON.stringify({ url: page.url(), loggato, login_step: LOGIN_STATE.step, login_running: LOGIN_STATE.running, ha_credenziali: !!(c.username && c.password), login_msg: LOGIN_STATE.msg || '', codice_in_attesa: !!(c.codice && (Date.now() - c.codice_ts) < 20 * 60 * 1000) }));
    }
    // ATTENZIONE: /loginstate va controllato PRIMA di /login (altrimenti '/loginstate'.startsWith('/login')
    // farebbe ripartire il login ad ogni polling dello stato → restava bloccato su 'start').
    if (u.pathname.startsWith('/loginstate')) {
      return res.end(JSON.stringify(LOGIN_STATE));
    }
    if (u.pathname.startsWith('/login')) {
      // avvia (o riprende) il login in BACKGROUND e ritorna subito lo stato
      autoLoginFlow();
      return res.end(JSON.stringify({ ok: true, ...LOGIN_STATE }));
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
      // Preventivatore Groupama: da mappare (il flusso verrà costruito come per HDI/Italiana).
      return res.end(JSON.stringify({ ok: false, error: 'Preventivatore Groupama non ancora implementato: prima va mappato il flusso (login OK).' }));
    }
    res.statusCode = 404; return res.end(JSON.stringify({ error: 'endpoint sconosciuto' }));
  } catch (e) { res.statusCode = 500; return res.end(JSON.stringify({ error: e.message })); }
}).listen(PORT, '127.0.0.1', () => log('telecomando HTTP su 127.0.0.1:' + PORT));
