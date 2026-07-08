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
// Rumore di tracciamento/telemetria da NON registrare (Dynatrace RUM, Adobe, Whatfix, beacon).
const SNIFF_NOISE = /\/rb_[a-z0-9]+|ruxitagent|\/settings\/\?t=|2o7\.net|adobedtm|omtrdc|whatfix|assets\.adobe|\/matrix\/assets\/|\/matrix\/media\//i;
// Cattura le chiamate UTILI del portale agenzie Allianz (Matrix /matrix/api/graphql + Banca Dati
// ANIA /Auto/... + Motor), escludendo asset e telemetria: così la registrazione resta pulita.
const sniffOk = (u) => /portaleagenzie\.allianz\.it/i.test(u) && !SNIFF_SKIP.test(u) && !SNIFF_NOISE.test(u);
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
  const wait = ms => new Promise(r => setTimeout(r, ms));
  // SCHEDA DEDICATA: il flusso ANIA apre/chiude finestre (WebInquiryAniaStart fa window.open + si
  // chiude). Non deve MAI toccare la pagina principale del quotatore /matrix/. Lavoro su una tab a
  // parte e raccolgo tutte le finestre che il flusso apre.
  const spawned = [];
  const onPage = pg => { spawned.push(pg); };
  ctx.on('page', onPage);
  const work = await ctx.newPage();
  try {
    await work.goto(ANIA_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await wait(1200);
    if (/amlogin\.allianz|nidp\/idff/i.test(work.url())) {
      await ensureLogin().catch(() => {});
      await work.goto(ANIA_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await wait(1200);
    }
    const filled = await work.evaluate((t) => {
      const tb = document.getElementById('ctl00_ContentBody_TextBoxTarga');
      if (!tb) return false;
      tb.focus(); tb.value = t;
      tb.dispatchEvent(new Event('input', { bubbles: true }));
      tb.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, targa).catch(() => false);
    if (!filled) return { filled: false };
    await wait(400);
    // "Cerca" → WebInquiryAniaStart.aspx, che a sua volta apre la finestra con i dati ANIA e si chiude.
    const clicked = await work.evaluate(() => {
      const b = document.getElementById('ctl00_ContentBody_ButtonRicerca')
        || [...document.querySelectorAll('input[type=submit],button')].find(x => /^cerca$/i.test((x.value || x.innerText || '').trim()));
      if (b) { b.click(); return true; }
      return false;
    }).catch(() => false);
    // leggo testo+tabelle da TUTTI i frame di una pagina (difensivo).
    const readPage = async (pg) => {
      try { if (!pg || pg.isClosed()) return []; } catch { return []; }
      const out = [];
      for (const fr of [pg.mainFrame(), ...pg.frames()]) {
        const info = await fr.evaluate(() => {
          const tables = [...document.querySelectorAll('table')].map(t => (t.innerText || '').replace(/\s+/g, ' ').trim()).filter(t => t.length > 8).slice(0, 14);
          return { url: location.href, text: (document.body && document.body.innerText || '').replace(/\n{2,}/g, '\n').trim(), tables };
        }).catch(() => null);
        if (info && (info.text || info.tables.length)) out.push(info);
      }
      return out;
    };
    const significativo = f => /codice fiscale|partita iva|polizza|copertura|scadenz|proprietar|contraente|attestato|classe|compagnia|targa/i.test(f.text) || f.tables.length;
    // attendo la catena di finestre e cerco i dati ANIA in qualunque pagina viva (work + spawned).
    let best = null;
    for (let i = 0; i < 10 && !best; i++) {
      await wait(2000);
      let frames = [];
      for (const pg of [work, ...spawned]) frames = frames.concat(await readPage(pg));
      const hit = frames.filter(significativo).sort((a, b) => (b.text.length + b.tables.join('').length) - (a.text.length + a.tables.join('').length))[0];
      if (hit) best = hit;
    }
    return { filled: true, clicked, npopup: spawned.length, result: best ? { url: best.url, text: best.text.slice(0, 6000), tables: best.tables } : { url: work.isClosed() ? '' : work.url(), text: '', tables: [] } };
  } finally {
    ctx.off('page', onPage);
    // chiudo work + tutte le finestre aperte dal flusso (mai la pagina principale `page`).
    for (const pg of [work, ...spawned]) { try { if (pg && pg !== page && !pg.isClosed()) await pg.close().catch(() => {}); } catch (e) {} }
  }
}

// Estrae i campi dalla schermata "Dettaglio" della Banca Dati ANIA (coppie "Etichetta: valore").
function parseAnia(rawText) {
  const text = (rawText || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const esc = s => s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
  // ordine: le etichette PIÙ LUNGHE prima (la CU prima della classe semplice) per non troncare male.
  const labels = ['Impresa', 'Contraente', 'Codice Fiscale', 'Partita IVA', 'Targa/Telaio', 'Tipo Veicolo',
    'Franchigie Non Corrisposte', 'Importi Franchigie', 'Importo Franchigie',
    'Classe di Provenienza CU', 'Classe di Provenienza', 'Classe di Assegnazione CU', 'Classe di Assegnazine CU',
    'Classe di Assegnazione', 'Classe di Assegnazine', 'Polizza', 'Tariffa', 'Avente diritto',
    'Decorrenza Copertura', 'Scadenza Copertura', 'Inizio Copertura', 'Fine Copertura',
    'Scadenza Polizza', 'Decorrenza Polizza', 'Data Scadenza', 'Data Decorrenza', 'Data Emissione',
    'Periodo Assicurativo', 'Decorrenza', 'Scadenza', 'Effetto', 'Frazionamento', 'Data Voltura', 'Tipo Contratto'];
  const boundary = labels.map(esc).join('|');
  const out = {};
  for (const lab of labels) {
    const re = new RegExp(esc(lab) + '\\s*:\\s*(.*?)\\s*(?=(?:' + boundary + ')\\s*:|$)', 'i');
    const m = text.match(re);
    if (m && m[1] != null) { const v = m[1].trim(); if (v) out[lab] = v; }
  }
  const piva = out['Partita IVA'] || null;
  const cfRaw = out['Codice Fiscale'] || null;
  return {
    impresa_attuale: out['Impresa'] || null,
    contraente: out['Contraente'] || out['Avente diritto'] || null,
    codice_fiscale: cfRaw,
    partita_iva: piva,
    is_azienda: !!(piva && (!cfRaw || cfRaw.length === 11)),
    targa: out['Targa/Telaio'] || null,
    tipo_veicolo: out['Tipo Veicolo'] || null,
    classe_provenienza: out['Classe di Provenienza'] || null,
    classe_cu: out['Classe di Provenienza CU'] || null,
    classe_assegnazione: out['Classe di Assegnazione'] || out['Classe di Assegnazine'] || null,
    classe_assegnazione_cu: out['Classe di Assegnazione CU'] || out['Classe di Assegnazine CU'] || null,
    polizza: out['Polizza'] || null,
    tariffa: out['Tariffa'] || null,
    scadenza_copertura: out['Scadenza Polizza'] || out['Scadenza Copertura'] || out['Fine Copertura'] || out['Data Scadenza'] || out['Scadenza'] || null,
    decorrenza_copertura: out['Decorrenza Polizza'] || out['Decorrenza Copertura'] || out['Inizio Copertura'] || out['Data Decorrenza'] || out['Decorrenza'] || out['Effetto'] || null,
    frazionamento: out['Frazionamento'] || null,
    _campi: out,
  };
}

// Serializza le operazioni sulla pagina: keep-alive e richieste non si sovrappongono.
let CHAIN = Promise.resolve();
function locked(fn) { const run = CHAIN.then(fn, fn); CHAIN = run.then(() => {}, () => {}); return run; }
// Pausa della keep-alive: durante un login MANUALE via VNC la keep-alive NON deve ricaricare la
// pagina (butterebbe fuori l'utente). /pausakeepalive?min=N sospende il keep-alive per N minuti.
let PAUSE_KA_UNTIL = 0;

// Dump iframe-aware di UNA pagina: per ogni frame ritorna url, link, campi e l'inizio del testo.
// Serve a mappare il fast-quote Motor (che può aprirsi in iframe o in finestra nuova).
async function dumpPage(pg, idx) {
  try { if (!pg || pg.isClosed()) return null; } catch { return null; }
  const frames = [];
  for (const fr of pg.frames()) {
    const info = await fr.evaluate(() => {
      const vis = e => e && e.offsetParent !== null;
      const clean = s => (s || '').replace(/\s+/g, ' ').trim().slice(0, 50);
      const links = [...document.querySelectorAll('a,[role=menuitem],[role=tab],button')].filter(vis).map(e => clean(e.innerText || e.value || e.getAttribute('aria-label'))).filter(t => t && t.length > 1);
      const fields = [...document.querySelectorAll('input,select,textarea')].filter(vis).map(e => ({ tag: e.tagName.toLowerCase(), type: e.getAttribute('type') || '', id: (e.id || '').slice(0, 42), name: (e.getAttribute('name') || '').slice(0, 42), ph: (e.getAttribute('placeholder') || '').slice(0, 42) }));
      return { url: location.href.slice(0, 140), nlinks: links.length, links: [...new Set(links)].slice(0, 50), fields: fields.slice(0, 40), bodylen: (document.body && document.body.innerText || '').length, texthead: (document.body && document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 600) };
    }).catch(() => null);
    if (info && (info.bodylen > 0 || info.fields.length)) frames.push(info);
  }
  return { page: idx, url: pg.url(), nframes: frames.length, frames };
}
// La "pagina attiva" del Motor = la finestra più recente diversa dalla home /matrix/ vuota; se non
// ci sono finestre figlie, è `page` stessa (caso iframe).
function motorTarget() {
  const pages = ctx.pages();
  for (let i = pages.length - 1; i >= 0; i--) {
    const p = pages[i];
    try { if (!p.isClosed() && p !== page) return p; } catch {}
  }
  return page;
}

// QUOTA MOTOR end-to-end: apre il fast-quote, imposta Targa + DataNascitaProprietario, CALCOLA e
// legge l'offerta (premio + garanzie) via le REST /assuntivomotor/quote/api/offerta/*. Ritorna un
// oggetto pronto per il backend. Tipo veicolo opzionale (auto=050000 default, moto, autocarro).
async function quotaMotor({ targa, nascita, tipo, bersaniTarga = '', infortuni = true, guidaEsperta = false, massimale = '563064501300' }) {
  bersaniTarga = String(bersaniTarga || '').toUpperCase().trim();
  const wait = ms => new Promise(r => setTimeout(r, ms));
  targa = (targa || '').toUpperCase().trim();
  nascita = (nascita || '').trim();
  // Tipo veicolo → codice del dropdown TipoVeicolo (default auto). Così quotiamo la linea giusta
  // (auto vs moto vs autocarro) ed evitiamo che resti su un default generico.
  const TIPOCODE = { auto: '050000', autovettura: '050000', moto: '602010', motociclo: '602010', ciclomotore: '602010', autocarro: '501216', altro: '999999' };
  const tipoCode = TIPOCODE[String(tipo || 'auto').toLowerCase()] || '050000';
  // 1) apri il Preventivo Motor dal menu Sales (click sull'anchor dentro lib-da-link)
  await page.goto('https://portaleagenzie.allianz.it/matrix/sales/', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.getByText('Preventivo Motor', { exact: true }).first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  await wait(1500);
  await page.evaluate(() => {
    const norm = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const comp = [...document.querySelectorAll('lib-da-link, lib-side-menu-link')].find(l => norm(l.innerText).includes('preventivo motor'));
    if (comp) { const a = comp.querySelector('a') || comp; a.click(); }
  }).catch(() => {});
  await wait(9000);
  let fr = page.frames().find(f => /assuntivomotor\/fast-quote/i.test(f.url()));
  if (!fr) return { ok: false, error: 'Fast-quote non aperto (sessione Allianz?)' };
  // 1b) imposta TipoVeicolo (controllo del modello dati-quotazione) PRIMA della targa, così il
  // lookup del veicolo parte già sulla linea corretta (auto/moto/autocarro).
  await fr.evaluate(async (code) => {
    try { await fetch('/assuntivomotor/quote/api/dati-quotazione/controlli/TipoVeicolo', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ valore: code, id: 'TipoVeicolo' }) }); } catch (e) {}
  }, tipoCode).catch(() => {});
  await wait(800);
  // 2) targa = primo input testo che NON è la data; poi data nascita; poi privacy
  const dateLoc = fr.getByPlaceholder('GG/MM/AAAA').first();
  const hasDate = await dateLoc.count().catch(() => 0);
  const txt = fr.locator('input:not([type=checkbox]):not([type=hidden])');
  const nTxt = await txt.count().catch(() => 0);
  let targaLoc = txt.first();
  if (hasDate && nTxt > 1) { for (let i = 0; i < nTxt; i++) { const c = txt.nth(i); const ph = (await c.getAttribute('placeholder').catch(() => '')) || ''; if (!/GG\/MM/i.test(ph)) { targaLoc = c; break; } } }
  if (targa) { try { await targaLoc.click({ timeout: 4000 }).catch(() => {}); await targaLoc.fill('').catch(() => {}); await targaLoc.pressSequentially(targa, { delay: 60, timeout: 9000 }); await targaLoc.press('Tab').catch(() => {}); } catch {} }
  await wait(1500);
  if (nascita && hasDate) { try { await dateLoc.click({ timeout: 4000 }).catch(() => {}); await dateLoc.fill('').catch(() => {}); await dateLoc.pressSequentially(nascita, { delay: 60, timeout: 9000 }); await dateLoc.press('Tab').catch(() => {}); } catch {} }
  await wait(700);
  try { const priv = fr.locator('nx-checkbox:has-text("informativa"), label:has-text("informativa")').first(); if (await priv.count().catch(() => 0)) { const box = priv.locator('input[type=checkbox]'); if (await box.isChecked().catch(() => false) === false) await priv.click({ timeout: 4000 }).catch(() => {}); } } catch {}
  await wait(700);
  // 3) CALCOLA
  const c = fr.locator('button:has-text("CALCOLA"), a:has-text("CALCOLA"), [role=button]:has-text("CALCOLA")').first();
  if (await c.count().catch(() => 0)) { await c.scrollIntoViewIfNeeded().catch(() => {}); await c.click({ timeout: 6000 }).catch(() => {}); }
  // 3b) VOLTURA/BERSANI: il calcolo va portato avanti con Calcola=OFFERTA poi Calcola=PROPRIETARIO
  //     (da cattura), altrimenti per la voltura il preventivo non si completa e non appare l'offerta.
  if (bersaniTarga) {
    await wait(2500);
    for (const val of ['OFFERTA', 'PROPRIETARIO']) {
      await fr.evaluate(async (v) => { try { await fetch('/assuntivomotor/quote/api/dati-quotazione/controlli/Calcola', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ valore: v, id: 'Calcola' }) }); } catch (e) {} }, val).catch(() => {});
      await wait(3500);
    }
  }
  // 4) attendo l'offerta (fino a ~25s) e leggo le REST nel frame assuntivomotor
  const offFrame = () => page.frames().find(f => /assuntivomotor\/preventivo\/offerta/i.test(f.url())) || page.frames().find(f => /assuntivomotor/i.test(f.url()));
  const leggiOfferta = async (off) => off.evaluate(async () => {
    const base = '/assuntivomotor/quote/api/';
    const j = async p => { try { const r = await fetch(base + p, { credentials: 'include' }); if (!r.ok) return null; return await r.json(); } catch (e) { return null; } };
    return { sintesi: await j('offerta/sintesi-offerta'), soluzioni: await j('offerta/soluzioni'), sezioni: await j('offerta/sezioni'), interruttori: await j('offerta/interruttori') };
  }).catch(() => null);
  let data = null;
  for (let i = 0; i < 13 && !data; i++) {
    await wait(2000);
    const off = offFrame(); if (!off) continue;
    const r = await leggiOfferta(off);
    if (r && r.sintesi && r.soluzioni) data = r;
  }
  // 4b) PACCHETTO garanzie (richiesta utente), via API REST dell'offerta (id ricavati dalla
  //     cattura): Massimale 1500-200, Tipo Guida 1500-240 (Esperta/Libera da QUOTO), Rinuncia
  //     rivalse 1500-251 (sempre), Accordo risarcimento forma specifica 1500-265 (sempre),
  //     Infortuni 7200- (da QUOTO). Ogni garanzia in /offerta/sezioni porta il suo `tipoExpo`,
  //     che è esattamente il corpo della PUT: lo rileggo, cambio `valore`, lo rimando.
  // 4a) BERSANI (provenienza): importa l'ATR/CU da un'altra targa (Legge Bersani). Sequenza (da
  //     cattura): isRcAuto (body vuoto) → link {scelta:true,targa:null} → richiesta {scelta:true,targa}.
  //     Gira PRIMA del pacchetto e ANCHE se il premio base non è ancora disponibile: per una Voltura
  //     il calcolo si completa solo DOPO aver dichiarato la provenienza. Zero effetto senza bersani.
  if (bersaniTarga) {
    const offB = offFrame();
    if (offB) {
      await offB.evaluate(async (bt) => {
        const base = '/assuntivomotor/uwcase/api/provenienza/polizza-rca/true/';
        const jput = async (p, body) => { try { const r = await fetch(base + p, { method: 'PUT', credentials: 'include', headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined }); const t = await r.text(); try { return JSON.parse(t); } catch (e) { return t; } } catch (e) { return null; } };
        try { await fetch('/assuntivomotor/uwcase/api/provenienza/get-dati', { credentials: 'include' }); } catch (e) {}
        const link = await jput('isRcAuto');
        const linkObj = (link && typeof link === 'object') ? link : { id: '1', tipo: 'link', titolo: '', testo: '' };
        const rich = await jput('link', Object.assign({}, linkObj, { scelta: true, targa: null }));
        const richObj = (rich && typeof rich === 'object') ? rich : { id: '1', tipo: 'richiesta', titolo: '', testo: 'è richiesta targa aggiuntiva', scelta: true };
        await jput('richiesta', Object.assign({}, richObj, { scelta: true, targa: bt }));
      }, bersaniTarga).catch(() => {});
      // ricalcolo dopo l'import della provenienza (per la voltura è QUI che nasce il premio)
      let db = null;
      for (let i = 0; i < 12 && !db; i++) { await wait(2000); const o = offFrame(); if (!o) continue; const r = await leggiOfferta(o); if (r && r.sintesi && r.soluzioni) db = r; }
      if (db) data = db;
    }
  }
  let pacCfg = null;
  if (data) {
    let off = offFrame();
    if (off) {
      pacCfg = await off.evaluate(async (opts) => {
        const base = '/assuntivomotor/quote/api/';
        const gj = async p => { try { const r = await fetch(base + p, { credentials: 'include' }); return r.ok ? await r.json() : null; } catch (e) { return null; } };
        const put = async (id, expo) => { try { const r = await fetch(base + 'offerta/garanzia/' + id + '/true', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(expo) }); return r.ok; } catch (e) { return false; } };
        const sez = await gj('offerta/sezioni');
        const all = []; (function w(o) { if (Array.isArray(o)) o.forEach(w); else if (o && typeof o === 'object') { if (o.id && o.tipoExpo) all.push(o); Object.values(o).forEach(w); } })(sez);
        const find = id => all.find(g => String(g.id) === id);
        const findPfx = pfx => all.find(g => String(g.id).indexOf(pfx) === 0 && g.tipoExpo);
        const r = {};
        const mas = find('1500-200'); if (mas) { mas.tipoExpo.valore = opts.massimale; r.massimale = await put('1500-200', mas.tipoExpo); }
        const gd = find('1500-240'); if (gd) { gd.tipoExpo.valore = opts.guidaEsperta ? '000000000002' : '000000000001'; r.guida = await put('1500-240', gd.tipoExpo); }
        const rv = find('1500-251'); if (rv) { rv.tipoExpo.valore = 'true'; r.rivalse = await put('1500-251', rv.tipoExpo); }
        const rs = find('1500-265'); if (rs) { rs.tipoExpo.valore = 'true'; r.risarcimento = await put('1500-265', rs.tipoExpo); }
        // Infortuni del conducente: pacchetto base = massimale 31.000 morte / 31.000 invalidità.
        // Scelgo l'opzione il cui testo contiene 31.000 (o 31k); se non la trovo, ripiego sull'ultima.
        if (opts.infortuni) {
          const inf = findPfx('7200');
          if (inf && inf.tipoExpo) {
            if (inf.tipoExpo.tipo === 'accordion') inf.tipoExpo.valore = 'true';
            else if (Array.isArray(inf.tipoExpo.opzioni) && inf.tipoExpo.opzioni.length) {
              const opz = inf.tipoExpo.opzioni;
              const testo = o => String(o.descrizione || o.label || o.testo || o.nome || o.valore || '');
              const o31 = opz.find(o => /31[.\s]?000|\b31\s*mila\b/i.test(testo(o)));
              inf.tipoExpo.valore = (o31 || opz[opz.length - 1]).chiave;
              r.infortuni_31k = !!o31;
            }
            r.infortuni = await put(inf.id, inf.tipoExpo);
          }
        }
        return r;
      }, { massimale, guidaEsperta, infortuni }).catch(() => null);
      // Sconto area riservata = METÀ del massimo disponibile (regola utente). Leggo il massimo dal
      // payload 'carica'; se non lo trovo uso 35% (max RCA tipico) → metà = 17,5%.
      await off.evaluate(async (frazione) => {
        const cbase = '/assuntivomotor/custom/api/area-riservata/inserimento-manuale/';
        try {
          const cr = await fetch(cbase + 'carica', { credentials: 'include' }); const cj = cr.ok ? await cr.json() : null;
          let max = 0; (function w(o) { if (Array.isArray(o)) o.forEach(w); else if (o && typeof o === 'object') { for (const k of Object.keys(o)) { if (/mass/i.test(k)) { const n = parseFloat(String(o[k]).replace('.', '').replace(',', '.')); if (!isNaN(n) && n > max && n <= 100) max = n; } } Object.values(o).forEach(w); } })(cj);
          if (!max) max = 35;
          const perc = String(Math.round(max * frazione * 10) / 10).replace('.', ',');
          await fetch(cbase + 'salva-cmc/RiduzioneCMC/' + encodeURIComponent(perc) + 'perc', { method: 'PUT', credentials: 'include' });
          await fetch(cbase + 'aggiorna', { method: 'PUT', credentials: 'include' });
        } catch (e) {}
      }, 0.5).catch(() => {});
      // attendo il ricalcolo e rileggo l'offerta aggiornata
      let d2 = null;
      for (let i = 0; i < 9 && !d2; i++) { await wait(2000); const o = offFrame(); if (!o) continue; const r = await leggiOfferta(o); if (r && r.sintesi && r.soluzioni) d2 = r; }
      if (d2) data = d2;
    }
  }
  if (!data) return { ok: false, error: 'Premio non disponibile (calcolo non completato o veicolo non quotabile)' };
  // 5) parse → premio + garanzie
  const s = data.sintesi || {};
  const pacchetti = [];
  for (const formula of (Array.isArray(data.soluzioni) ? data.soluzioni : [])) {
    for (const p of (formula.pacchetti || [])) {
      if (p && typeof p.premio === 'number' && p.premio > 0) pacchetti.push({ formula: formula.formula || '', sigla: p.sigla || '', descrizione: p.descrizione || '', premio: p.premio, frazionamento: p.frazionamento || s.frazionamento || '', selezionato: !!p.selezionato });
    }
  }
  // dedup (la risposta a volte ripete lo stesso pacchetto)
  const uniq = []; const seen = new Set();
  for (const p of pacchetti) { const k = p.sigla + '|' + p.premio + '|' + p.frazionamento; if (!seen.has(k)) { seen.add(k); uniq.push(p); } }
  const sel = uniq.find(p => p.selezionato) || uniq[0] || null;
  // GARANZIE DISPONIBILI: elenco completo che la compagnia mette a disposizione (offerta/sezioni),
  // sezione per sezione, con incluse/attivabili, premio e lo sconto max di area riservata.
  const itNum = v => { if (v == null || v === '') return null; const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.')); return isNaN(n) ? null : n; };
  const sezioni = [];
  for (const sez of (data.sezioni && Array.isArray(data.sezioni.sezioni) ? data.sezioni.sezioni : [])) {
    const gar = [];
    for (const g of (sez.garanzie || [])) {
      const st = g.stato || {}; const ar = g.areaRiservata || {};
      gar.push({
        nome: g.nome || '', id: g.id || null,
        premio: typeof g.premio === 'number' ? g.premio : itNum(g.premio),
        premio_non_scontato: typeof g.premioNonScontato === 'number' ? g.premioNonScontato : itNum(g.premioNonScontato),
        inclusa: !!st.selezionato, attivabile: !!st.visibile,
        sconto_max_pct: ar.percentuale ? itNum(ar.percentuale.massimoAge) : null,
        sconto_max_importo: ar.importo ? itNum(ar.importo.massimoAge) : null,
      });
    }
    sezioni.push({ nome: sez.nome || '', premio: typeof sez.premio === 'number' ? sez.premio : itNum(sez.premio), premio_non_scontato: itNum(sez.premioNonScontato), garanzie: gar });
  }
  const incluse = sezioni.flatMap(x => x.garanzie).filter(g => g.inclusa).map(g => g.nome);
  // sconti/leve disponibili (interruttori): nome→{attivo,visibile,abilitato}
  const inter = data.interruttori || {}; const sconti = {};
  for (const k of Object.keys(inter)) { const o = inter[k] || {}; if (o.id) sconti[o.id] = { attivo: !!o.selezionato, visibile: !!o.visibile, abilitato: !!o.abilitato }; }
  return {
    ok: true, targa, nascita,
    premio_annuale: sel ? sel.premio : null,
    pacchetto: sel ? (sel.sigla + ' — ' + sel.descrizione) : null,
    tipo_guida: guidaEsperta ? 'Guida esperta' : 'Guida libera', // guida realmente applicata (per il dettaglio QUOTO)
    massimale_applicato: massimale,
    pacchetto_base: pacCfg || null,                              // esiti PUT: massimale/guida/rivalse/risarcimento/infortuni
    classe_cu: s.classe || null,
    tipo_veicolo: s.tipoVeicolo || null,
    valore_assicurato: s.valoreAssicurato || null,
    decorrenza: s.dataDecorrenza || null,
    scadenza: s.dataScadenza || null,
    frazionamenti: s.elencoFrazionamenti || null,
    garanzie: uniq,                 // pacchetti/formule (Bonus Malus, Nuova 4R)
    garanzie_incluse: incluse,      // nomi garanzie già comprese nel premio
    sezioni,                        // elenco completo garanzie disponibili per sezione
    sconti,                         // leve sconto disponibili (ScontoDigital, AreaRiservata, ...)
  };
}

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
        const ania = (r && r.result && r.result.text) ? parseAnia(r.result.text) : null;
        const trovato = !!(ania && (ania.codice_fiscale || ania.partita_iva));
        return { ok: true, targa, trovato, ania, campo_targa_compilato: !!(r && r.filled), submit: !!(r && r.clicked), risultato: (r && r.result) || null };
      });
      return res.end(JSON.stringify(out, null, 2));
    }
    if (u.pathname.startsWith('/sniff/start')) { sniffStart(); return res.end(JSON.stringify({ ok: true, sniffing: true })); }
    if (u.pathname.startsWith('/sniff/stop')) {
      const buf = sniffStop();
      try { fs.writeFileSync(CATTURA_FILE, JSON.stringify(buf, null, 1)); } catch (e) {}
      // Ritorno il buffer COMPLETO (richieste+risposte con i corpi GraphQL), formato standard
      // {captured, calls} come gli altri scraper: i corpi servono a ricostruire il preventivo.
      return res.end(JSON.stringify({ ok: true, recording: false, captured: buf.length, calls: buf, salvato: CATTURA_FILE }, null, 2));
    }
    if (u.pathname.startsWith('/premio')) {
      // PREVENTIVO MOTOR: /premio?targa=AB12345&nascita=GG/MM/AAAA → premio + garanzie
      const targa = (u.searchParams.get('targa') || '').toUpperCase().trim();
      const nascita = (u.searchParams.get('nascita') || '').trim();
      const tipo = (u.searchParams.get('tipo') || 'auto').trim();
      const bersaniTarga = (u.searchParams.get('bersani') || u.searchParams.get('bersaniTarga') || '').toUpperCase().trim(); // Legge Bersani: targa da cui importare l'ATR/CU
      const infortuni = String(u.searchParams.get('infortuni') || '1') !== '0'; // default: includi Infortuni conducente
      const gp = (u.searchParams.get('guida') || u.searchParams.get('guidaEsperta') || u.searchParams.get('tipoGuida') || '').trim();
      const guidaEsperta = gp === '1' || /esperta/i.test(gp); // Tipo Guida: Esperta se QUOTO lo richiede, altrimenti Libera
      // Massimale RCA: QUOTO manda l'etichetta ("Minimo" / "10 milioni"), il portale vuole il CODICE.
      // Mappo le etichette sui codici; se arriva già un codice numerico lungo, lo uso così com'è.
      const massimaleRaw = (u.searchParams.get('massimale') || '').trim();
      const MASSIMALE_COD = { minimo: '563064501300', '10 milioni': '553000010000', '10milioni': '553000010000', '10mln': '553000010000' };
      const massimale = /^\d{8,}$/.test(massimaleRaw) ? massimaleRaw
        : (MASSIMALE_COD[massimaleRaw.toLowerCase()] || '563064501300'); // default 6.45M/1.3M
      if (!targa || !nascita) return res.end(JSON.stringify({ ok: false, error: 'Uso: /premio?targa=AB12345&nascita=GG/MM/AAAA[&tipo=auto|moto|autocarro][&infortuni=0][&guida=esperta][&massimale=553000010000]' }));
      const out = await locked(async () => {
        if (!onPortal() && !(await ensureLogin().catch(() => false)))
          return { ok: false, error: 'Non loggato ad Allianz: premi "Verifica accesso" e approva la notifica Duo.' };
        log('Preventivo Motor:', targa, nascita, tipo, 'infortuni:', infortuni, 'guidaEsperta:', guidaEsperta, 'massimale:', massimale);
        try { return await quotaMotor({ targa, nascita, tipo, bersaniTarga, infortuni, guidaEsperta, massimale }); }
        catch (e) { return { ok: false, error: String(e && e.message || e) }; }
      });
      return res.end(JSON.stringify(out, null, 2));
    }
    if (u.pathname.startsWith('/motor')) {
      // DRIVER del Preventivo Motor (fast-quote). Apre il flusso e mappa TUTTE le finestre/iframe.
      //   /motor?step=open           → va su Sales, clicca "Preventivo Motor", dumpa tutte le pagine
      //   /motor?step=click&text=..  → clicca un testo nella finestra Motor attiva
      //   /motor?step=type&val=..&sel=.. → scrive in un campo della finestra Motor attiva
      //   /motor?step=dump           → solo dump dello stato attuale
      //   &wait=ms  &sniff=1 (avvia cattura prima di agire)
      const out = await locked(async () => {
        if (!onPortal() && !(await ensureLogin().catch(() => false)))
          return { error: 'Non loggato ad Allianz: premi "Verifica accesso" e approva la notifica Duo.' };
        const wait = ms => new Promise(r => setTimeout(r, ms));
        const step = u.searchParams.get('step') || 'open';
        const W = Math.min(30000, parseInt(u.searchParams.get('wait') || '12000', 10) || 12000);
        if (u.searchParams.get('sniff') === '1') sniffStart();
        try {
          var probe = null;
          var azioni;
          if (step === 'open' || step === 'probe') {
            await page.goto('https://portaleagenzie.allianz.it/matrix/sales/', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
            await page.getByText('Preventivo Motor', { exact: true }).first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
            await wait(1500);
            // SONDA: trova il nodo "Preventivo Motor" e risali al primo antenato cliccabile (a/button/[role]).
            probe = await page.evaluate(() => {
              const want = 'preventivo motor';
              const all = [...document.querySelectorAll('a,button,[role=button],[role=menuitem],[routerlink],li,span,div')];
              const node = all.find(e => (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase() === want);
              if (!node) return { found: false };
              let cl = node;
              for (let i = 0; i < 6 && cl; i++) { if (cl.matches('a,button,[role=button],[role=menuitem],[routerlink]')) break; cl = cl.parentElement; }
              const info = el => el ? { tag: el.tagName.toLowerCase(), href: el.getAttribute('href') || '', routerlink: el.getAttribute('routerlink') || el.getAttribute('ng-reflect-router-link') || '', role: el.getAttribute('role') || '', cls: (el.className || '').toString().slice(0, 60), outer: el.outerHTML.replace(/\s+/g, ' ').slice(0, 240) } : null;
              return { found: true, node: info(node), clickable: info(cl) };
            }).catch(() => ({ found: false, err: true }));
            if (step === 'open') {
              // Il link vero è l'<a> DENTRO <lib-da-link> (componente Angular). Provo Playwright sull'anchor,
              // poi fallback a click DOM sull'<a> dentro lib-da-link che contiene "Preventivo Motor".
              const tryClick = async (loc) => { try { await loc.scrollIntoViewIfNeeded().catch(() => {}); await loc.click({ timeout: 7000 }); return true; } catch { return false; } };
              let clicked = await tryClick(page.locator('lib-da-link:has-text("Preventivo Motor") a, lib-side-menu-link:has-text("Preventivo Motor") a').first());
              if (!clicked) clicked = await tryClick(page.locator('lib-da-link:has-text("Preventivo Motor")').first());
              if (!clicked) clicked = await tryClick(page.getByText('Preventivo Motor', { exact: true }).first());
              if (!clicked) { // fallback: click DOM sull'<a> (o sul componente) che contiene il testo
                await page.evaluate(() => {
                  const norm = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
                  const comp = [...document.querySelectorAll('lib-da-link, lib-side-menu-link')].find(l => norm(l.innerText).includes('preventivo motor'));
                  if (comp) { const a = comp.querySelector('a') || comp; a.click(); return true; }
                  return false;
                }).catch(() => {});
              }
              await wait(W);
            }
          } else if (step === 'click') {
            const t = u.searchParams.get('text') || '';
            const tgt = motorTarget();
            for (const fr of tgt.frames()) {
              const b = fr.locator(`a:has-text("${t}"), button:has-text("${t}"), [role=button]:has-text("${t}"), nx-link:has-text("${t}"), label:has-text("${t}")`).first();
              if (await b.count().catch(() => 0)) { await b.scrollIntoViewIfNeeded().catch(() => {}); await b.click({ timeout: 6000 }).catch(() => {}); break; }
            }
            await wait(W);
          } else if (step === 'type') {
            const val = u.searchParams.get('val') || '';
            const sel = u.searchParams.get('sel') || 'input:visible';
            const tgt = motorTarget();
            for (const fr of tgt.frames()) {
              let inp = fr.locator(sel).first();
              if (await inp.count().catch(() => 0)) { try { await inp.scrollIntoViewIfNeeded().catch(() => {}); await inp.click({ timeout: 3000 }).catch(() => {}); await inp.fill('').catch(() => {}); await inp.pressSequentially(val, { delay: 60, timeout: 9000 }); if (u.searchParams.get('enter') === '1') await inp.press('Enter'); break; } catch (e) {} }
            }
            await wait(W);
          } else if (step === 'quote') {
            // Compila il fast-quote DENTRO l'iframe assuntivomotor (id dinamici → uso posizione/placeholder)
            // e clicca CALCOLA. Param: targa, nascita (GG/MM/AAAA), tipo (auto/...), calcola=1.
            const targa = (u.searchParams.get('targa') || '').toUpperCase().trim();
            const nascita = (u.searchParams.get('nascita') || '').trim();
            const fr = page.frames().find(f => /assuntivomotor\/fast-quote/i.test(f.url()));
            if (!fr) return { step, error: 'iframe fast-quote non aperto: lancia prima /motor?step=open' };
            const dateLoc = fr.getByPlaceholder('GG/MM/AAAA').first();
            const hasDate = await dateLoc.count().catch(() => 0);
            // targa = primo input di testo che NON è la data (e non checkbox)
            const txtInputs = fr.locator('input:not([type=checkbox]):not([type=hidden])');
            const nTxt = await txtInputs.count().catch(() => 0);
            let targaLoc = txtInputs.first();
            if (hasDate && nTxt > 1) { // scegli l'input diverso dalla data
              for (let i = 0; i < nTxt; i++) { const cand = txtInputs.nth(i); const ph = (await cand.getAttribute('placeholder').catch(() => '')) || ''; if (!/GG\/MM/i.test(ph)) { targaLoc = cand; break; } }
            }
            if (targa) { try { await targaLoc.scrollIntoViewIfNeeded().catch(() => {}); await targaLoc.click({ timeout: 4000 }).catch(() => {}); await targaLoc.fill('').catch(() => {}); await targaLoc.pressSequentially(targa, { delay: 70, timeout: 9000 }); await targaLoc.press('Tab').catch(() => {}); } catch (e) {} }
            await wait(1500);
            if (nascita && hasDate) { try { await dateLoc.click({ timeout: 4000 }).catch(() => {}); await dateLoc.fill('').catch(() => {}); await dateLoc.pressSequentially(nascita, { delay: 70, timeout: 9000 }); await dateLoc.press('Tab').catch(() => {}); } catch (e) {} }
            await wait(800);
            // spunta l'informativa privacy (checkbox obbligatoria *) cercando il testo "informativa"
            try {
              const priv = fr.locator('nx-checkbox:has-text("informativa"), label:has-text("informativa")').first();
              if (await priv.count().catch(() => 0)) { const box = priv.locator('input[type=checkbox]'); if (await box.isChecked().catch(() => false) === false) await priv.click({ timeout: 4000 }).catch(() => {}); }
            } catch (e) {}
            await wait(800);
            if (u.searchParams.get('calcola') === '1') {
              const c = fr.locator('button:has-text("CALCOLA"), a:has-text("CALCOLA"), [role=button]:has-text("CALCOLA")').first();
              if (await c.count().catch(() => 0)) { await c.scrollIntoViewIfNeeded().catch(() => {}); await c.click({ timeout: 6000 }).catch(() => {}); }
              await wait(W);
            }
          } else if (step === 'contraente') {
            // Compila lo step Contraente del wizard per ETICHETTA (id dinamici) gestendo gli
            // autocomplete (comune/città/provincia: digita e seleziona l'opzione). Param: cf,nome,
            // cognome,nascita,comune,indirizzo,civico,citta,cap,prov; avanti=1 per cliccare AVANTI.
            const fr = page.frames().find(f => /assuntivomotor/i.test(f.url()));
            if (!fr) return { step, error: 'iframe assuntivomotor non aperto' };
            const g = k => (u.searchParams.get(k) || '').trim();
            const D = { cf: g('cf').toUpperCase(), nome: g('nome'), cognome: g('cognome'), nascita: g('nascita'), comune: g('comune'), indirizzo: g('indirizzo'), civico: g('civico'), citta: g('citta'), cap: g('cap'), prov: g('prov') };
            azioni = [];
            const typeByLabel = async (re, val, pick) => {
              if (!val) return;
              let loc = fr.getByLabel(re).first();
              if (!(await loc.count().catch(() => 0))) loc = fr.locator(`nx-formfield:has-text("${typeof re === 'string' ? re : ''}") input`).first();
              if (!(await loc.count().catch(() => 0))) { azioni.push('NO:' + re); return; }
              try {
                await loc.scrollIntoViewIfNeeded().catch(() => {});
                await loc.click({ timeout: 4000 }).catch(() => {});
                await loc.fill('').catch(() => {});
                await loc.pressSequentially(val, { delay: 55, timeout: 9000 });
                if (pick) {
                  await wait(1500);
                  let opt = fr.getByRole('option').filter({ hasText: new RegExp(val.slice(0, 4).replace(/[.*+?^${}()|[\]\\]/g, ''), 'i') }).first();
                  if (!(await opt.count().catch(() => 0))) opt = fr.locator('nx-autocomplete-option, [role=option], mat-option, .nx-dropdown__panel li').first();
                  if (await opt.count().catch(() => 0)) { await opt.click({ timeout: 4000 }).catch(() => {}); azioni.push('PICK:' + re); }
                  else azioni.push('NOOPT:' + re);
                } else { await loc.press('Tab').catch(() => {}); azioni.push('OK:' + re); }
              } catch (e) { azioni.push('ERR:' + re); }
            };
            await typeByLabel(/codice fiscale|partita iva/i, D.cf); await wait(900);
            await typeByLabel(/\bnome\b/i, D.nome);
            await typeByLabel(/cognome|ragione sociale/i, D.cognome);
            await typeByLabel(/data di nascita/i, D.nascita);
            await typeByLabel(/comune di nascita/i, D.comune, true);
            await typeByLabel(/indirizzo di residenza/i, D.indirizzo, true);
            await typeByLabel(/civico/i, D.civico);
            await typeByLabel(/citt.{0,2}di residenza/i, D.citta, true);
            await typeByLabel(/cap di residenza|\bcap\b/i, D.cap);
            await typeByLabel(/provincia/i, D.prov, true);
            await wait(900);
            if (u.searchParams.get('avanti') === '1') {
              const b = fr.locator('button:has-text("AVANTI"), a:has-text("AVANTI"), [role=button]:has-text("AVANTI")').first();
              if (await b.count().catch(() => 0)) { await b.scrollIntoViewIfNeeded().catch(() => {}); await b.click({ timeout: 6000 }).catch(() => {}); }
              await wait(W);
            }
          } else if (step === 'configura') {
            // Attiva/disattiva garanzie nell'OFFERTA cliccando il checkbox della riga col nome dato.
            // Param: on=Nome1,Nome2 (attiva) · off=Nome3 (disattiva). Ritorna l'esito in azioni.
            const off = page.frames().find(f => /assuntivomotor\/preventivo\/offerta/i.test(f.url())) || page.frames().find(f => /assuntivomotor/i.test(f.url()));
            if (!off) return { step, error: 'offerta non aperta: lancia open+quote(calcola) prima' };
            const onL = (u.searchParams.get('on') || '').split(',').map(s => s.trim()).filter(Boolean);
            const offL = (u.searchParams.get('off') || '').split(',').map(s => s.trim()).filter(Boolean);
            azioni = await off.evaluate(({ onL, offL }) => {
              const norm = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
              const log = [];
              const toggle = (nome, voglioAttiva) => {
                const n = norm(nome);
                // riga = elemento più piccolo che contiene il nome E un checkbox
                const cands = [...document.querySelectorAll('*')].filter(e => {
                  try { return e.querySelector && e.querySelector('input[type=checkbox]') && norm(e.innerText).includes(n); } catch (x) { return false; }
                });
                cands.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
                const row = cands[0];
                if (!row) { log.push('NO_ROW:' + nome); return; }
                const cb = row.querySelector('input[type=checkbox]');
                if (!cb) { log.push('NO_CB:' + nome); return; }
                if (!!cb.checked === !!voglioAttiva) { log.push('GIA_OK:' + nome); return; }
                try { (cb.closest('label') || cb).click(); if (!!cb.checked !== !!voglioAttiva) cb.click(); log.push((voglioAttiva ? 'ON:' : 'OFF:') + nome); } catch (e) { log.push('ERR:' + nome); }
              };
              onL.forEach(n => toggle(n, true));
              offL.forEach(n => toggle(n, false));
              return log;
            }, { onL, offL }).catch(e => ['EVAL_ERR:' + String(e)]);
            await wait(W); // ricalcolo premio dopo il toggle
          } else {
            await wait(parseInt(u.searchParams.get('wait') || '500', 10) || 500);
          }
          const pages = ctx.pages();
          const all = [];
          for (let i = 0; i < pages.length; i++) { const d = await dumpPage(pages[i], i); if (d) all.push(d); }
          return { step, probe: (typeof probe !== 'undefined' ? probe : null), azioni: (typeof azioni !== 'undefined' ? azioni : null), npages: pages.length, target: motorTarget().url(), pages: all };
        } catch (e) { return { step, error: String(e) }; }
      });
      return res.end(JSON.stringify(out, null, 1));
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
