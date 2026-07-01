// ═══════════════════════════════════════════════════════════════════════════════
//  Italiana Assicurazioni — scraper portale (login + sessione persistente)
//  Stesso schema di Allianz/24H: browser PERSISTENTE su display virtuale + telecomando HTTP.
//
//  - Credenziali dal Pannello Fonti (server/fonti.store.json → __custom, cifrate
//    AES-256-GCM con la stessa chiave FONTI_SECRET del backend).
//  - Login GENERICO: compila utente/password e invia. Se compare un codice
//    (Duo / OTP / SMS), inserisce il PASSCODE salvato nel pannello.
//  - Se l'auto-login non riesce, si fa il login UNA volta via VNC (porta 5902):
//    la sessione resta salvata in ./userdata.
//  - I selettori esatti della pagina si tarano con /logindump dopo il primo deploy.
//
//  Porta 4300 · Display :97 · VNC 5902  (Allianz: 4200/:98/5901 — 24H: 4100/:99/5900)
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
const FONTE_ID = process.env.FONTE_ID || 'c-hdi';
const DEFAULT_LOGIN = 'https://access.hdia.it/uefa/';
const log = (...a) => console.log(new Date().toLocaleTimeString('it-IT'), '[hdi]', ...a);

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
function getFonte(store) {
  const cs = (store && store.__custom) || {};
  if (cs[FONTE_ID]) return cs[FONTE_ID];
  for (const k of Object.keys(cs)) if (/italiana/i.test(cs[k].nome || '')) return cs[k];
  return {};
}
function creds() {
  try {
    const store = JSON.parse(fs.readFileSync(STORE, 'utf8'));
    const s = getFonte(store);
    return {
      username: dec(s.username), password: dec(s.password),
      codice: s.codice ? dec(s.codice) : '',
      loginUrl: (s.url && String(s.url).trim()) || DEFAULT_LOGIN,
    };
  } catch { return { username: '', password: '', codice: '', loginUrl: DEFAULT_LOGIN }; }
}
const origin = (u) => { try { return new URL(u).origin; } catch { return 'https://access.hdia.it'; } };
// L'app agenzie HDI ("Giada") vive SEMPRE qui. NON ricavo l'host dall'URL salvato in Fonti:
// l'utente può avervi incollato l'URL OIDC di idm.hdia.it (host del LOGIN, non dell'app) — in tal
// caso si finiva su idm.hdia.it/uefa/ (vuoto). La radice nuda access.hdia.it/ dà 403; il path /uefa/
// è la SPA che reindirizza da sola al login Keycloak (PKCE fresco) e poi torna su /uefa/callback.
const APP_HOME = 'https://access.hdia.it/uefa/';
const appHome = () => APP_HOME;
// Nodo agenzia HDI da selezionare alla CONFERMA d'ingresso (videata "Seleziona nodo di emissione").
const HDI_NODO = process.env.HDI_NODO || '1428';

// Avvio del contesto persistente, in una funzione così da poterlo RILANCIARE se il
// browser muore del tutto (crash → "Target page, context or browser has been closed").
async function launchCtx() {
  // ripulisco eventuali lock orfani del profilo, altrimenti il rilancio fallisce
  for (const f of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    try { fs.rmSync(path.join(userDataDir, f), { force: true }); } catch {}
  }
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

// ── Modalità SNIFF: registra le chiamate di rete interne (XHR/fetch) durante un
//    preventivo, per scoprire le API nascoste di Plurima (lookup targa, calcolo
//    premio/tariffe). Si attiva solo quando SNIFF.on === true (endpoint /sniff),
//    così in funzionamento normale non c'è overhead. Cattura URL, metodo, header
//    utili, body della richiesta e (se JSON/testo) il corpo della risposta.
const SNIFF = { on: false, buf: [], max: 1500, t0: 0 };
const sniffPush = (o) => { if (SNIFF.on && SNIFF.buf.length < SNIFF.max) SNIFF.buf.push(o); };
// Rumore da ignorare: tracker e CDN di terze parti (gtm, analytics, fb, linkedin, maps, cloudflare…)
const NOISE = /googletagmanager|google-analytics|googleapis|gstatic|recaptcha|google\.com\/(ccm|recaptcha|maps)|google\.it\/maps|linkedin\.com|facebook|fbcdn|mpc-prod|\.run\.app|cloudflare|doubleclick|hotjar|\.(png|jpg|jpeg|gif|svg|css|woff2?|ttf|ico|map)(\?|$)/i;
const interesting = (url, type) => {
  // LE API interne di Plurima: il vero obiettivo (lookup targa, calcolo premio, job…)
  if (/\/a__php\/|__ajax\.php/i.test(url || '')) return true;
  if (NOISE.test(url || '')) return false;
  // Per il portale, SCARTA gli asset statici (js/css/img e cartelle libreria): tieni solo i dati
  if (/plurima\.net|italnext/i.test(url || '')) {
    if (/\.(js|css|png|jpe?g|gif|svg|woff2?|ttf|ico|map)(\?|$)/i.test(url || '')) return false;
    if (/\/(assets|node_modules|dist|lib)\//i.test(url || '')) return false;
    return type === 'xhr' || type === 'fetch';
  }
  // Altri XHR/fetch non-rumore (rari)
  return type === 'xhr' || type === 'fetch';
};
// Aggancia i listener a una pagina (dialog + sniff request/response). Va richiamato anche quando
// la pagina viene ricreata (auto-recupero), perché i listener sono legati allo specifico oggetto page.
function wirePage(p) {
  // Accetta automaticamente eventuali alert/confirm nativi (es. avvisi al salvataggio)
  p.on('dialog', d => d.accept().catch(() => {}));
  p.on('request', (req) => {
    try {
      if (!SNIFF.on) return;
      const type = req.resourceType();
      const url = req.url();
      if (!interesting(url, type)) return;
      let body = '';
      try { body = req.postData() || ''; } catch {}
      sniffPush({ kind: 'req', t: Date.now() - SNIFF.t0, type, method: req.method(), url, body: String(body).slice(0, 4000) });
    } catch {}
  });
  p.on('response', async (resp) => {
    try {
      if (!SNIFF.on) return;
      const req = resp.request();
      const type = req.resourceType();
      const url = req.url();
      if (!interesting(url, type)) return;
      const ct = (resp.headers()['content-type'] || '').toLowerCase();
      let body = '';
      if (/json|text|javascript|xml|form/.test(ct) || type === 'xhr' || type === 'fetch') {
        try { body = await resp.text(); } catch {}
      }
      sniffPush({ kind: 'res', t: Date.now() - SNIFF.t0, type, status: resp.status(), ct, method: req.method(), url, body: String(body).slice(0, 60000) });
    } catch {}
  });
}
wirePage(page);
// AUTO-RECUPERO: se la pagina/browser risulta chiusa (crash, navigazione anomala), la ricrea
// invece di restare bloccata su "Target page... closed" fino al riavvio manuale del servizio.
async function ensurePage() {
  let closed = true;
  try { closed = !page || page.isClosed(); } catch { closed = true; }
  if (!closed) return;
  log('[recovery] pagina chiusa → la ricreo');
  // Provo a riusare il contesto; se è morto anche il browser (newPage lancia
  // "Target page, context or browser has been closed") RILANCIO l'intero contesto.
  try {
    page = ctx.pages().find(p => { try { return !p.isClosed(); } catch { return false; } }) || await ctx.newPage();
  } catch (e) {
    log('[recovery] contesto/browser morto → rilancio il contesto:', e.message);
    try { await ctx.close().catch(() => {}); } catch {}
    ctx = await launchCtx();
    page = ctx.pages()[0] || await ctx.newPage();
  }
  wirePage(page);
}
// Spegnimento PULITO su SIGTERM/SIGINT: chiudo il contesto e esco subito, così
// `systemctl restart` non resta 90s in 'final-sigterm' (poi SIGKILL, che orfana il
// browser sul profilo e causa conflitti al riavvio). Hard-exit di sicurezza dopo 8s.
let shuttingDown = false;
function gracefulExit(sig) {
  if (shuttingDown) return; shuttingDown = true;
  log('[shutdown]', sig, '→ chiudo il contesto ed esco');
  setTimeout(() => process.exit(0), 8000).unref();
  ctx.close().catch(() => {}).finally(() => process.exit(0));
}
process.on('SIGTERM', () => gracefulExit('SIGTERM'));
process.on('SIGINT', () => gracefulExit('SIGINT'));
function sniffStart() { SNIFF.on = true; SNIFF.buf = []; SNIFF.t0 = Date.now(); }
function sniffStop() { SNIFF.on = false; return SNIFF.buf.slice(); }
// Riepilogo compatto: raggruppa per endpoint (path), conta, segna chi ha body JSON.
function sniffSummary(buf) {
  const byUrl = {};
  for (const e of buf) {
    let key = e.url;
    try { const U = new URL(e.url); key = U.origin + U.pathname; } catch {}
    byUrl[key] = byUrl[key] || { url: key, methods: new Set(), reqs: 0, ress: 0, jsonRes: 0, statuses: new Set() };
    const g = byUrl[key];
    if (e.kind === 'req') { g.reqs++; g.methods.add(e.method); }
    else { g.ress++; if (e.status) g.statuses.add(e.status); if (/json/.test(e.ct || '') || /^[\s]*[[{]/.test(e.body || '')) g.jsonRes++; }
  }
  return Object.values(byUrl).map(g => ({ url: g.url, methods: [...g.methods], reqs: g.reqs, ress: g.ress, jsonRes: g.jsonRes, statuses: [...g.statuses] }))
    .sort((a, b) => (b.jsonRes - a.jsonRes) || (b.reqs - a.reqs));
}
// Ripulisce le chiamate catturate per la lettura (mobile): toglie il rumore (notifiche),
// accorcia la risposta enorme di carica_campi (tariffe) e tronca i body troppo lunghi.
function tidyCaptured(buf) {
  return (buf || [])
    .filter(e => !/get_notifiche_comunicazioni|ultime_notifiche|numero_notifiche/.test(e.body || ''))
    .map(e => /"tariffe"\s*:/.test(e.body || '')
      ? { ...e, body: '[carica_campi: ' + ((e.body.match(/id_tariffa/g) || []).length) + ' tariffe Italiana — troncato]' }
      : e)
    .map(e => (typeof e.body === 'string' && e.body.length > 1600) ? { ...e, body: e.body.slice(0, 1600) + '…[troncato]' } : e);
}

const isLoginUrl = (url) => /login|signin|accedi|auth|sso|nidp|duosecurity/i.test(url || '');
async function hasPasswordField() {
  return await page.evaluate(() => !!document.querySelector('input[type=password]')).catch(() => false);
}
// Riconosce la LANDING pubblica di Plurima/Italnext (pagina di benvenuto con i
// pulsanti di accesso): NON significa essere loggati.
async function isPublicLanding() {
  return await page.evaluate(() => /accedi con le tue credenziali|registrati subito|ti diamo il benvenuto|area riservata italnext/i.test(document.body.innerText || '')).catch(() => false);
}
// Loggato = pagina del portale che NON è login, NON è la landing pubblica, senza password.
async function loggedIn() {
  await page.goto(appHome(), { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  // La SPA "Giada" impiega qualche secondo a decidere: o resta sull'app (loggato), o rimbalza
  // al form Keycloak (non loggato). Attendo che si stabilizzi prima di giudicare.
  await page.waitForTimeout(6000);
  if (isLoginUrl(page.url())) return false;
  if (await hasPasswordField()) return false;
  if (await isPublicLanding()) return false;   // landing = non loggato (falso positivo storico)
  return true;
}

const fillFirst = async (selectors, value) => {
  for (const s of selectors) {
    const el = page.locator(s).first();
    if (await el.count().catch(() => 0)) { try { await el.fill(value, { timeout: 4000 }); return s; } catch {} }
  }
  return null;
};
const submitForm = () => page.evaluate(() => {
  const b = [...document.querySelectorAll('button,input[type=submit],a')].find(x => /accedi|login|entra|conferma|submit|avanti|continua|sign ?in/i.test((x.innerText || x.value || '') + (x.id || '') + (x.name || '')));
  if (b) b.click(); else { const f = document.querySelector('form'); if (f) f.submit(); }
});

// Inserisce un PASSCODE (Duo/OTP/SMS) se la pagina lo richiede dopo utente+password.
async function enterPasscode(code) {
  const roots = () => [page, ...page.frames()];
  const findInput = async () => {
    for (const root of roots()) {
      const el = root.locator('input[name*="passcode" i], input[id*="passcode" i], input[name*="otp" i], input[name*="code" i], input[name*="token" i], input[autocomplete="one-time-code"], input[type="tel"], input[placeholder*="codice" i], input[placeholder*="passcode" i]').first();
      if ((await el.count().catch(() => 0)) && (await el.isVisible().catch(() => false))) return { el, root };
    }
    return null;
  };
  let f = await findInput();
  if (!f) {
    for (const root of roots()) {
      const b = root.locator('button:has-text("passcode"), a:has-text("passcode"), button:has-text("codice"), a:has-text("codice"), button:has-text("Other options"), a:has-text("Altre opzioni")').first();
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

async function autoLogin() {
  const c = creds();
  if (!c.username || !c.password) { log('autoLogin: credenziali assenti nel Pannello Fonti'); return false; }
  await page.goto(appHome(), { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  // La SPA "Giada" reindirizza DA SOLA al form Keycloak (idm.hdia.it): può volerci qualche
  // secondo (carica config OIDC + redirect). Attendo la comparsa del campo password con un
  // loop, invece di un timeout fisso (così non ripiego per errore prima che il form esista).
  for (let i = 0; i < 20 && !(await hasPasswordField()); i++) await page.waitForTimeout(1000);
  // Fallback per portali NON-SPA: se ancora non c'è il form, prova un link "credenziali".
  if (!(await hasPasswordField())) {
    await page.evaluate(() => { const b = [...document.querySelectorAll('a,button')].find(x => /accedi con le tue credenziali|le tue credenziali/i.test(x.innerText || '')); if (b) b.click(); }).catch(() => {});
    await page.waitForTimeout(1800);
  }
  // Compila SOLO dentro al form che contiene il campo password (così non si riempie
  // per errore la barra di ricerca sullo sfondo). Username = primo input testuale
  // visibile dello stesso form, diverso dalla password.
  const filled = await page.evaluate(({ u, p }) => {
    const vis = e => e && e.offsetParent !== null;
    const pwd = [...document.querySelectorAll('input[type=password]')].find(vis);
    if (!pwd) return { ok: false, reason: 'campo password non trovato' };
    const form = pwd.closest('form') || document;
    const skip = ['hidden', 'checkbox', 'radio', 'submit', 'button', 'password'];
    const user = [...form.querySelectorAll('input')].find(e => e !== pwd && vis(e) && !skip.includes((e.type || 'text').toLowerCase()));
    const set = (el, val) => { el.focus(); el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    if (user) set(user, u);
    set(pwd, p);
    return { ok: !!user };
  }, { u: c.username, p: c.password }).catch(e => ({ ok: false, reason: e.message }));
  log('autoLogin: campi compilati =', JSON.stringify(filled));
  if (!filled.ok) return false;
  await page.waitForTimeout(400);
  // Click "Accedi" dentro al form del login
  await page.evaluate(() => {
    const vis = e => e && e.offsetParent !== null;
    const pwd = [...document.querySelectorAll('input[type=password]')].find(vis);
    const form = pwd && pwd.closest('form');
    const scope = form || document;
    const b = [...scope.querySelectorAll('button,input[type=submit],a[role=button],a')].find(x => /accedi|login|entra|conferma|sign ?in|avanti/i.test((x.innerText || x.value || '')));
    if (b) b.click(); else if (form) form.submit();
  }).catch(() => {});
  // Attende il completamento del flusso OIDC (idm.hdia.it → /uefa/callback → app): qualche secondo.
  for (let i = 0; i < 10; i++) { await page.waitForTimeout(1500); if (!isLoginUrl(page.url()) && !(await hasPasswordField())) { log('autoLogin: loggato'); return true; } }
  // Eventuale secondo fattore (Duo/OTP/SMS)
  if (c.codice) {
    log('autoLogin: provo a inserire il codice salvato...');
    await enterPasscode(c.codice).catch(e => log('passcode err:', e.message));
    for (let i = 0; i < 10; i++) { await page.waitForTimeout(2000); if (!isLoginUrl(page.url()) && !(await hasPasswordField())) { log('autoLogin: codice accettato → loggato'); return true; } }
  }
  log('autoLogin: non loggato (serve codice o primo accesso via VNC)');
  return !isLoginUrl(page.url()) && !(await hasPasswordField());
}

async function ensureLogin() {
  if (await loggedIn()) return true;
  log('Non loggato: provo auto-login...');
  if (await autoLogin().catch(e => (log('autoLogin err:', e.message), false))) { log('Auto-login OK'); return true; }
  log('Auto-login non riuscito. Mappa con /logindump oppure accedi via VNC (127.0.0.1:5903).');
  const c = creds();
  await page.goto(c.loginUrl).catch(() => {});
  return false;
}

let ok = await loggedIn().catch(() => false);
if (!ok) ok = await ensureLogin().catch(() => false);
log(ok ? 'LOGGATO: ' + page.url() : 'login non rilevato (pronto per VNC)');

async function richDump() {
  return page.evaluate(() => {
    const clean = s => (s || '').replace(/\s+/g, ' ').trim().slice(0, 70);
    const sel = 'button,a[role=button],input,select,textarea,[role=combobox],label,form';
    const ctrls = [...document.querySelectorAll(sel)].map(e => ({
      tag: e.tagName.toLowerCase(), id: e.id || null, name: e.getAttribute('name') || null,
      type: e.getAttribute('type') || null, text: clean(e.innerText || e.value),
    })).filter(x => x.id || x.name || (x.text && x.text.length));
    return { url: location.href, title: document.title, text: (document.body.innerText || '').replace(/\n{2,}/g, '\n').slice(0, 3000), ctrls };
  });
}

// Clicca un elemento (link/voce di menu/bottone) col testo che combacia con `reSrc`.
async function clickByText(reSrc, maxLen = 45) {
  return page.evaluate(({ reSrc, maxLen }) => {
    const re = new RegExp(reSrc, 'i');
    const vis = e => e && e.offsetParent !== null;
    const norm = s => (s || '').replace(/\s+/g, ' ').trim();
    const els = [...document.querySelectorAll('a,button,span,div,li,p,[role=button],[role=menuitem]')].filter(vis);
    // preferisce il match più "stretto" (testo corto = la voce, non il contenitore)
    const cands = els.filter(e => { const t = norm(e.innerText); return re.test(t) && t.length <= maxLen; })
      .sort((a, b) => norm(a.innerText).length - norm(b.innerText).length);
    if (!cands.length) return false;
    const el = cands[0].closest('a,button,[role=button],[role=menuitem],li') || cands[0];
    el.click(); return true;
  }, { reSrc, maxLen });
}

// Naviga il menu di Plurima fino al form "Calcola preventivo" della RC Auto individuale.
// Best-effort: ritorna quali tappe ha cliccato (per capire dove si ferma).
async function navToQuoteForm() {
  const base = origin(creds().loginUrl);
  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2500);
  if (isLoginUrl(page.url()) || await hasPasswordField()) { await ensureLogin(); await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}); await page.waitForTimeout(2000); }
  const nav = {};
  // DEBUG: elenco delle voci del menu laterale (per tarare i testi esatti dei link)
  nav.menu = await page.evaluate(() => {
    const norm = s => (s || '').replace(/\s+/g, ' ').trim();
    const out = [];
    document.querySelectorAll('#sidebarnav a, nav a, aside a, .sidebar a, ul li a').forEach(a => {
      const t = norm(a.innerText); const href = a.getAttribute('href') || '';
      if (t && t.length < 50) out.push(t + (href ? '  →  ' + href : ''));
    });
    return [...new Set(out)].slice(0, 80);
  }).catch(() => []);
  nav.prodotti = await clickByText('^prodotti$|prodotti'); await page.waitForTimeout(1400);
  nav.rcCircolazione = await clickByText('r\\.?c\\.? *circolazione|circolazione'); await page.waitForTimeout(1400);
  nav.rcAuto = await clickByText('r\\.?c\\.? *auto *individuale|auto *individuale'); await page.waitForTimeout(1600);
  nav.calcola = await clickByText('calcola *preventivo'); await page.waitForTimeout(2600);
  nav.urlDopo = page.url();
  return nav;
}

// ── Preventivo AUTO · Step 1 (Dati Base): targa → lente → situazione assicurativa ─
// Best-effort: ritorna anche la "mappa" della pagina (campi reali) per tarare i passi.
async function autoStep1(o = {}) {
  const base = origin(creds().loginUrl);
  // 1) prova a raggiungere il form dal menu (percorso reale del portale)
  const nav = await navToQuoteForm();
  // 2) se il menu non ha portato a un campo targa, prova la rotta diretta /auto
  const hasTargaField = async () => page.evaluate(() => {
    const vis = e => e && e.offsetParent !== null;
    return [...document.querySelectorAll('input')].some(e => vis(e) && /targa/i.test((e.placeholder || '') + (e.name || '') + (e.id || '') + ((e.closest('div,label') || {}).innerText || '')));
  });
  if (!(await hasTargaField())) {
    await page.goto(base + '/auto', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(2500);
    if (isLoginUrl(page.url()) || await hasPasswordField()) {
      await ensureLogin(); await page.goto(base + '/auto', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(2000);
    }
  }
  const steps = { nav, targa: false, lente: false, situazione: false, attestato: false };
  if (o.targa) {
    // Campo targa: prima cerca un input che "sa di targa" (placeholder/name/label),
    // altrimenti ripiega sul primo input testuale visibile.
    steps.targa = await page.evaluate((t) => {
      const vis = e => e && e.offsetParent !== null;
      const near = e => (e.placeholder || '') + ' ' + (e.name || '') + ' ' + (e.id || '') + ' ' + ((e.closest('div,label,form') || {}).innerText || '');
      const inputs = [...document.querySelectorAll('input[type=text],input:not([type]),input[type=search]')].filter(vis);
      const inp = inputs.find(e => /targa/i.test(near(e))) || inputs[0];
      if (!inp) return false;
      inp.focus(); inp.value = t; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); inp.dispatchEvent(new Event('keyup', { bubbles: true }));
      window.__targaInput = inp; // riusato sotto per la lente / Enter
      return true;
    }, String(o.targa).toUpperCase());
    await page.waitForTimeout(500);
    // click sulla lente (icona di ricerca accanto alla targa)
    steps.lente = await page.evaluate(() => {
      const vis = e => e && e.offsetParent !== null;
      const inp = window.__targaInput || [...document.querySelectorAll('input[type=text],input:not([type])')].filter(vis)[0];
      if (!inp) return false;
      // cerca la lente salendo di qualche livello dal campo targa
      let cont = inp.parentElement;
      for (let i = 0; i < 4 && cont; i++, cont = cont.parentElement) {
        const cand = [...cont.querySelectorAll('button,a,i,span,[role=button]')].filter(vis).find(b => {
          const s = (b.className || '') + ' ' + (b.getAttribute('aria-label') || '') + ' ' + (b.title || '');
          return /search|lente|cerca|magnif|fa-search|ti-search|ricerca/i.test(s) || (b.querySelector && b.querySelector('svg,i,img'));
        });
        if (cand) { (cand.closest('button,a,[role=button]') || cand).click(); return true; }
      }
      return false;
    });
    // fallback: Invio sul campo (spesso fa partire la ricerca targa)
    await page.evaluate(() => { const inp = window.__targaInput; if (inp) inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, bubbles: true })); }).catch(() => {});
    await page.keyboard.press('Enter').catch(() => {});
    await page.waitForTimeout(5000); // attende il recupero veicolo dalla banca dati (job)
  }
  if (o.situazione) {
    steps.situazione = await page.evaluate((val) => {
      for (const s of document.querySelectorAll('select')) {
        const opt = [...s.options].find(o => new RegExp(val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(o.textContent || ''));
        if (opt) { s.value = opt.value; s.dispatchEvent(new Event('change', { bubbles: true })); return true; }
      }
      return false;
    }, o.situazione);
    await page.waitForTimeout(1500);
  }
  if (o.attestato) {
    steps.attestato = await page.evaluate((val) => {
      for (const s of document.querySelectorAll('select')) {
        const around = (s.closest('div') || {}).innerText || '';
        if (!/attestato|rischio/i.test(around)) continue;
        const opt = [...s.options].find(o => new RegExp('^\\s*' + val + '\\s*$', 'i').test(o.textContent || ''));
        if (opt) { s.value = opt.value; s.dispatchEvent(new Event('change', { bubbles: true })); return true; }
      }
      return false;
    }, o.attestato);
    await page.waitForTimeout(800);
  }
  await page.screenshot({ path: 'shots/auto-step1.png', fullPage: true }).catch(() => {});
  return { steps, url: page.url(), dump: await richDump() };
}

// Click sul bottone "Successivo" del wizard
async function clickSuccessivo() {
  return page.evaluate(() => {
    const b = [...document.querySelectorAll('button,a,input[type=submit]')].find(x => /successivo|avanti|continua|prosegui/i.test((x.innerText || x.value || '')));
    if (b) { b.click(); return true; } return false;
  });
}
// Compila un campo (input/textarea) o select vicino a un'etichetta che contiene `lbl`
async function fillByLabel(lbl, value, isSelect = false) {
  return page.evaluate(({ lbl, value, isSelect }) => {
    const norm = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const labels = [...document.querySelectorAll('label,div,span,p,h3,h4,strong,b')].filter(e => norm(e.innerText).includes(lbl.toLowerCase()));
    for (const L of labels) {
      const cont = L.closest('div') || L.parentElement;
      if (!cont) continue;
      const el = isSelect ? cont.querySelector('select') : cont.querySelector('input,textarea');
      if (el) {
        if (isSelect) { const o = [...el.options].find(o => new RegExp(value, 'i').test(o.textContent || '')); if (o) el.value = o.value; }
        else { el.focus(); el.value = value; }
        el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    return false;
  }, { lbl, value, isSelect });
}
// Legge una coppia chiave→valore da un'etichetta (per anagrafica/veicolo recuperati)
async function readFields(labels) {
  return page.evaluate((labels) => {
    const norm = s => (s || '').replace(/\s+/g, ' ').trim();
    const out = {};
    for (const lbl of labels) {
      const L = [...document.querySelectorAll('label,div,span,p,strong,b')].find(e => norm(e.innerText).toLowerCase().startsWith(lbl.toLowerCase()));
      if (!L) continue;
      const cont = L.closest('div') || L.parentElement;
      const el = cont && cont.querySelector('input,select,textarea');
      out[lbl] = el ? (el.value || (el.options && el.options[el.selectedIndex] && el.options[el.selectedIndex].text) || '') : '';
    }
    return out;
  }, labels);
}

// ── Preventivo AUTO completo (4 step) → premio ──────────────────────────────────
// Best-effort sulle etichette di Plurima; ritorna anche i dump per tarare.
async function autoPreventivo(o = {}) {
  const trace = [];
  const s1 = await autoStep1(o); trace.push({ step: 1, fatti: s1.steps, url: s1.url });
  // Targa Bersani (se attestato da altro veicolo)
  if (o.bersani) { await fillByLabel('targa bersani', String(o.bersani).toUpperCase()); await page.waitForTimeout(400); }
  // (Tipo guida si gestisce allo step 4 con la spunta "Conducente esperto")
  await clickSuccessivo(); await page.waitForTimeout(3500);
  // STEP 2 — Anagrafiche (recuperate). Eventuale cambio via di residenza.
  if (o.indirizzo) { await fillByLabel('indirizzo', o.indirizzo); await page.waitForTimeout(500); }
  const anagrafica = await readFields(['Codice fiscale', 'Cognome', 'Nome', 'Data di nascita', 'Indirizzo']);
  trace.push({ step: 2, url: page.url() });
  await clickSuccessivo(); await page.waitForTimeout(3500);
  // STEP 3 — Veicolo. Chiede SEMPRE la Data ultima voltura.
  if (o.dataUltimaVoltura) { await fillByLabel('ultima voltura', o.dataUltimaVoltura); await page.waitForTimeout(500); }
  const veicolo = await readFields(['Marca', 'Modello', 'Allestimento', 'Alimentazione', 'Cilindrata', 'Kilowatt', 'Data immatricolazione', 'Tipo veicolo', 'Uso', 'Valore assicurato']);
  // Situazione assicurativa (attestato di rischio): è il dato che rende Italiana l'HUB centrale
  const situazione = await readFields(['Data scadenza contratto', 'Tariffa di provenienza', 'Compagnia di provenienza', 'CU di provenienza', 'CU assegnata', 'Data ultima voltura']);
  trace.push({ step: 3, url: page.url() });
  await clickSuccessivo(); await page.waitForTimeout(7000); // quotazione in corso
  // STEP 4 — Parametri di quotazione (ricalcolano il premio), poi legge il prezzo
  // Massimale RC: "minimo di legge" (6.450.000) oppure 10.000.000
  if (o.massimale) {
    await page.evaluate((m) => {
      const wantHigh = /10|dieci/.test(m);
      for (const s of document.querySelectorAll('select')) {
        const around = ((s.closest('div') || {}).innerText || '').toLowerCase();
        if (!/massimale/.test(around)) continue;
        const opt = [...s.options].find(o => wantHigh ? /10[.\s]?000[.\s]?000/.test(o.textContent || '') : /6[.\s]?450[.\s]?000/.test(o.textContent || ''));
        if (opt) { s.value = opt.value; s.dispatchEvent(new Event('change', { bubbles: true })); return true; }
      }
      return false;
    }, String(o.massimale));
    await page.waitForTimeout(3000);
  }
  // Tipo guida ESPERTA → "Dettagli garanzia" rivela la clausola "Conducente esperto"
  if (/espert/i.test(o.tipoGuida || '')) {
    await page.evaluate(() => { const b = [...document.querySelectorAll('a,button,span,div')].find(x => /dettagli garanzia/i.test(x.innerText || '')); if (b) b.click(); });
    await page.waitForTimeout(900);
    await page.evaluate(() => {
      const lbl = [...document.querySelectorAll('label,div,span')].find(x => /conducente esperto/i.test(x.innerText || ''));
      const cb = lbl && (lbl.querySelector('input[type=checkbox]') || (lbl.closest('div,label') || document).querySelector('input[type=checkbox]'));
      if (cb && !cb.checked) cb.click();
    });
    await page.waitForTimeout(2800);
  }
  // Frazionamento: Annuale / Semestrale
  if (o.frazionamento) { await fillByLabel('frazionamento', o.frazionamento, true); await page.waitForTimeout(3000); }
  // Aggiunge SEMPRE "Infortuni del conducente" (clic sul +)
  await page.evaluate(() => {
    const vis = e => e && e.offsetParent !== null;
    const lbl = [...document.querySelectorAll('div,span,label,h3,h4,b,strong,p')].find(x => {
      const t = (x.innerText || '').trim(); return /infortuni\s+(del\s+)?conducente/i.test(t) && t.length < 80;
    });
    if (!lbl) return;
    let card = lbl;
    for (let i = 0; i < 6 && card.parentElement; i++) {
      card = card.parentElement;
      const btn = [...card.querySelectorAll('button,a,[role=button]')].filter(vis).find(b => {
        const s = ((b.innerText || '') + ' ' + (b.className || '') + ' ' + (b.getAttribute('aria-label') || '')).toLowerCase();
        return /^\+$/.test((b.innerText || '').trim()) || /plus|add|aggiung/.test(s);
      });
      if (btn) { btn.click(); return; }
    }
  });
  await page.waitForTimeout(2800);
  // Applica SEMPRE lo sconto massimo: slider tutto a destra + "Applica sconto"
  await page.evaluate(() => {
    const sl = document.querySelector('input[type=range]');
    if (sl) { const max = sl.max || sl.getAttribute('max') || '100'; sl.value = max; sl.dispatchEvent(new Event('input', { bubbles: true })); sl.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find(x => /applica\s+sconto/i.test(x.innerText || '')); if (b) b.click(); });
  await page.waitForTimeout(3500);
  // STEP 4 — Preventivo: legge il premio
  const prezzo = await page.evaluate(() => {
    const txt = (document.body.innerText || '');
    const num = re => { const m = txt.match(re); return m ? m[1].replace(/\s/g, '') : ''; };
    const premio = num(/premio\s+annuale\s+lordo[^0-9]*([0-9][0-9.\s]*,[0-9]{2})/i);
    const provvigioni = num(/provvigion[ei][^0-9]*([0-9][0-9.\s]*,[0-9]{2})/i);
    const comp = (txt.match(/ITALIANA ASSICURAZIONI|ITALIANA|HDI|UNIPOL|GENERALI|ALLIANZ|GROUPAMA|ZURICH|AXA|CATTOLICA/i) || [])[0] || '';
    const daAutorizzare = /riservato\s*(a\s*)?direzione/i.test(txt);
    return { premio, provvigioni, compagnia: comp, daAutorizzare };
  });
  await page.screenshot({ path: 'shots/auto-preventivo.png', fullPage: true }).catch(() => {});
  // SALVA il preventivo (solo se richiesto): "Salva Preventivo" → eventuale modale "riservato direzione" → OK
  let salvato = false;
  if (o.salva) {
    salvato = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button,a')].find(x => /salva\s+(il\s+)?preventivo/i.test(x.innerText || ''));
      if (b) { b.click(); return true; } return false;
    });
    await page.waitForTimeout(3500);
    await page.evaluate(() => { const ok = [...document.querySelectorAll('button,a')].find(x => /^\s*ok\s*$/i.test((x.innerText || '').trim())); if (ok) ok.click(); }).catch(() => {});
    await page.waitForTimeout(1500);
  }
  return { ok: !!prezzo.premio, premio: prezzo.premio, provvigioni: prezzo.provvigioni, compagnia: prezzo.compagnia, daAutorizzare: prezzo.daAutorizzare, salvato, anagrafica, veicolo, situazione, trace, url: page.url(), dump: await richDump() };
}

// ── Motore diretto: chiama le azioni del portale DENTRO la pagina, riusando la
//    funzione ajaxPlurima() del portale (che firma da sola con server_key/time).
//    È il modo robusto per quotare senza pilotare i click.
async function ensureOnPortal() {
  await ensurePage(); // se il browser/pagina è morto, lo ricrea (auto-recupero)
  const hasApi = async () => page.evaluate(() => typeof ajaxPlurima === 'function' && typeof path_new !== 'undefined').catch(() => false);
  if (await hasApi() && !(await isPublicLanding())) return true;
  if (!(await loggedIn())) await ensureLogin();
  if (!(await hasApi())) {
    await page.goto(origin(creds().loginUrl) + '/auto', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(2500);
  }
  return await hasApi();
}
async function plurimaAjax(action, params = {}) {
  await ensureOnPortal();
  return page.evaluate(({ action, params }) => new Promise((resolve) => {
    if (typeof ajaxPlurima !== 'function') return resolve({ error: 'ajaxPlurima non disponibile (pagina non del portale?)' });
    const data = Object.assign({ a: action }, params);
    let done = false; const finish = v => { if (!done) { done = true; resolve(v); } };
    try {
      ajaxPlurima({
        url: (typeof path_new !== 'undefined' ? path_new : '') + '/a__php/__ajax.php',
        data, type: 'POST', cache: false,
        success: (d) => finish(d),
        error: (xhr) => finish({ error: 'http ' + (xhr && xhr.status), status: xhr && xhr.status }),
      });
    } catch (e) { finish({ error: e.message }); }
    setTimeout(() => finish({ error: 'timeout' }), 30000);
  }), { action, params });
}

let CHAIN = Promise.resolve();
function locked(fn) { const run = CHAIN.then(fn, fn); CHAIN = run.then(() => {}, () => {}); return run; }

// ── DATI VEICOLO da Plurima: pilota il wizard reale del preventivatore fino allo step 2 ──────
// Scrive la targa (scatena i veri handler → carica la situazione), seleziona la situazione e
// clicca "Successivo" (a[href="#next"]). La pagina esegue il SUO flusso e carica_dati_preventivatore
// popola `dati_preventivatore.data.veicolo` (marca/modello/alimentazione/cilindrata/kW…). È l'unico
// modo affidabile: le chiamate "a freddo" vengono rifiutate ("targa vuota") perché manca lo stato wizard.
async function driveVeicolo(targa, sitLabel = 'Rinnovo', opts = {}) {
  const debug = opts.debug || false;
  const bersaniTarga = (opts.bersaniTarga || '').toUpperCase().trim();
  await ensureOnPortal();
  await page.goto(origin(creds().loginUrl) + '/auto', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2200);
  // Per il Bersani lo sniff serve SEMPRE: l'attestato della targa di provenienza torna nella
  // risposta di carica_attestato_rischio (non in dati_preventivatore), e lo recuperiamo da lì.
  if (debug || bersaniTarga) sniffStart();
  const drive = await page.evaluate(async ({ targa, sitLabel, bersaniTarga }) => {
    const log = []; const $ = window.jQuery; const sleep = ms => new Promise(r => setTimeout(r, ms));
    const optsOf = sel => [...(sel && sel.options || [])].map(o => ({ v: o.value, t: (o.textContent || '').trim() }));
    try {
      if (!$) return { error: 'jQuery assente' };
      const t = $('#targa'); if (!t.length) return { error: '#targa assente' };
      t.val(targa).trigger('input').trigger('keyup').trigger('change').trigger('blur');
      for (let i = 0; i < 30 && !$('#situazione_assicurativa').length; i++) await sleep(500);
      if (!$('#situazione_assicurativa').length) return { error: 'situazione non caricata (targa non valida o non trovata?)' };
      $('#situazione_assicurativa').val(sitLabel).trigger('change');
      await sleep(1200);
      // ── BERSANI / Voltura: compare il campo bersani_provenienza (+ targa_provenienza) ──────
      let bersaniInfo = null;
      const bp = document.getElementById('bersani_provenienza');
      if (bp) {
        bersaniInfo = { opzioni: optsOf(bp), valore_attuale: bp.value };
        if (bersaniTarga) {
          // scelgo l'opzione "importa da altra targa" = la prima diversa da "No"
          const imp = [...bp.options].find(o => o.value && !/^no$/i.test(o.value) && !/^no$/i.test(o.textContent || ''));
          if (imp) { $(bp).val(imp.value).trigger('change'); bersaniInfo.scelta = imp.value; await sleep(900); }
          // compilo la targa di provenienza (da cui importare la classe di merito)
          const tp = document.getElementById('targa_provenienza');
          if (tp) { $(tp).val(bersaniTarga).trigger('input').trigger('keyup').trigger('change').trigger('blur'); bersaniInfo.targa_provenienza_set = bersaniTarga; await sleep(1500); }
          else bersaniInfo.targa_provenienza_field = 'ASSENTE';
        }
      }
      log.push('bersani: ' + JSON.stringify(bersaniInfo));
      const nextA = document.querySelector('a[href="#next"], .actions a[href="#next"], a[href$="next"]');
      if (!nextA) return { error: 'link "Successivo" non trovato', log, bersaniInfo };
      nextA.click();
      // attendo che dati_preventivatore.data si popoli (fino ~14s)
      for (let i = 0; i < 28; i++) { await sleep(500); if (typeof dati_preventivatore !== 'undefined' && dati_preventivatore && dati_preventivatore.data) break; }
      const dp = (typeof dati_preventivatore !== 'undefined') ? dati_preventivatore : null;
      if (!dp || !dp.data) return { error: 'dati_preventivatore non popolato', log, bersaniInfo };
      // BERSANI: l'attestato della targa di provenienza arriva DOPO (carica_attestato_rischio).
      // Attendo che la situazione si popoli e cerco l'attestato anche nei globali della pagina.
      let attestatoGlobali = null;
      if (bersaniTarga) {
        const hasAtt = sa => sa && (Array.isArray(sa.attestato_rischio) ? sa.attestato_rischio.length : (sa.cu_provenienza || sa.cu_assegnazione));
        for (let i = 0; i < 20; i++) { await sleep(500); if (hasAtt(dati_preventivatore && dati_preventivatore.data && dati_preventivatore.data.situazione_assicurativa)) break; }
        const cand = ['dati_attestato_rischio', 'attestato_rischio', 'dati_situazione_assicurativa', 'dati_attestato', 'attestato'];
        attestatoGlobali = {};
        for (const g of cand) { try { if (typeof window[g] !== 'undefined' && window[g]) attestatoGlobali[g] = window[g]; } catch (e) {} }
      }
      const data = dati_preventivatore.data;
      const v = Object.assign({}, data.veicolo || {});
      if (v.infocar) v.infocar = '[omesso]';
      return {
        ok: true, veicolo: v, prodotto: data.prodotto || null, esito_message: dp.message || '', dataKeys: Object.keys(data),
        situazione_assicurativa: data.situazione_assicurativa || null,
        proprietario: data.proprietario || null,
        contraente: data.contraente || null,
        data_scadenza_polizza: data.data_scadenza_polizza || null,
        garanzie_predefinite: data.garanzie_predefinite || null,
        attestato_globali: attestatoGlobali,
        bersaniInfo, log,
      };
    } catch (e) { return { error: e.message, log }; }
  }, { targa, sitLabel, bersaniTarga });
  let sniff = null, situazioneBersani = null;
  if (debug || bersaniTarga) {
    const buf = sniffStop();
    // BERSANI: estraggo la situazione assicurativa dalla risposta di carica_attestato_rischio.
    // Prendo la risposta più "completa" (quella con cu_provenienza valorizzato).
    if (bersaniTarga) {
      const candidati = buf.filter(e => e.kind === 'res' && /attestato_rischio/.test(e.body || ''))
        .map(e => { try { return JSON.parse(e.body); } catch { return null; } })
        .map(j => (j && j.data && j.data.situazione_assicurativa) ? j.data.situazione_assicurativa : null)
        .filter(Boolean);
      situazioneBersani = candidati.find(s => s.cu_provenienza || s.cu_assegnazione) || candidati.find(s => Array.isArray(s.attestato_rischio) && s.attestato_rischio.length) || null;
    }
    if (debug) {
      sniff = buf.filter(e => /__ajax\.php/.test(e.url || '')).map(e => e.kind === 'req'
        ? { req: (String(e.body || '').match(/a=([a-z_]+)/) || [, '?'])[1] }
        : { res: e.status, body: String(e.body || '').slice(0, 2500) });
    }
  }
  if (!drive || drive.error) return { ok: false, error: (drive && drive.error) || 'drive fallito', bersaniInfo: drive && drive.bersaniInfo, log: drive && drive.log, sniff };
  const v = drive.veicolo || {};
  const veicolo = {
    marca: v.marca || null,
    modello: v.modello || null,
    allestimento: v.allestimento || v.versione || null,
    alimentazione: v.alimentazione || null,
    cilindrata: v.cilindrata || null,
    kilowatt: v.kilowatt || v.kw || null,
    cavalli: v.cavalli || v.cv || null,
    data_immatricolazione: v.data_immatricolazione || null,
    uso: v.uso || null,
    peso_veicolo: v.peso_veicolo || null,
    valore: v.valore || v.valore_commerciale || null,
    codice_motornet: v.codice_motornet || v.codiceMotorNet || null,
  };
  // Per il Bersani la situazione viene dall'attestato della targa di provenienza (carica_attestato_rischio);
  // altrimenti (Rinnovo) da dati_preventivatore.
  const sitFinale = situazioneBersani
    || (drive.situazione_assicurativa && !Array.isArray(drive.situazione_assicurativa) ? drive.situazione_assicurativa : null);
  return {
    ok: true, targa, situazione: sitLabel, veicolo, prodotto: drive.prodotto, raw_veicolo: v,
    situazione_assicurativa: sitFinale,
    bersani_da: bersaniTarga || null,
    proprietario: drive.proprietario || null,
    contraente: drive.contraente || null,
    data_scadenza_polizza: drive.data_scadenza_polizza || null,
    garanzie_predefinite: drive.garanzie_predefinite || null,
    dataKeys: drive.dataKeys, bersaniInfo: drive.bersaniInfo || null, sniff,
  };
}

// ── HDI / Giada (UEFA): PREVENTIVO RCA da targa, AUTO e MOTO ─────────────────────────────────
// Flusso (manuale HDI RCA): /uefa/ → videata "Seleziona nodo di emissione" = HDI_NODO → CONFERMA →
// home con box "EMISSIONI FAST / Motor": N. Targa + Data Nascita → QUOTA → pagina "Fast Motor" con
// "Premio Annuale" lordo + "Gestione Garanzie" (RCA, Incendio, Furto…). Per il preventivo (confronto)
// ci fermiamo al premio; il resto (adeguatezza, finalizza, salva proposta) serve solo all'emissione.
// App Angular Material: uso locator NATIVI Playwright (i click sintetici verrebbero ignorati).
async function driveHDIQuote(targa, nascita = '', opts = {}) {
  const log = []; const L = (...a) => log.push(a.map(String).join(' '));
  if (!(await loggedIn())) { L('non loggato → ensureLogin'); await ensureLogin(); }
  await page.goto(APP_HOME, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(3500);
  sniffStart();
  // 1) NODO + CONFERMA (solo se compare la videata di selezione nodo)
  try {
    const conferma = page.getByRole('button', { name: /^\s*conferma\s*$/i }).first();
    if (await conferma.count().catch(() => 0)) {
      L('videata nodo presente; seleziono', HDI_NODO);
      for (const sel of ['mat-select', '[role=combobox]', 'select', 'input']) {
        const el = page.locator(sel).first();
        if (await el.count().catch(() => 0)) { await el.click({ timeout: 4000 }).catch(() => {}); break; }
      }
      await page.waitForTimeout(900);
      await page.keyboard.type(String(HDI_NODO)).catch(() => {});
      await page.waitForTimeout(1100);
      let picked = false;
      const opt = page.getByRole('option', { name: new RegExp(HDI_NODO) }).first();
      if (await opt.count().catch(() => 0)) { await opt.click({ timeout: 4000 }).catch(() => {}); picked = true; }
      else { const t = page.getByText(new RegExp('\\b' + HDI_NODO + '\\b')).first(); if (await t.count().catch(() => 0)) { await t.click({ timeout: 4000 }).catch(() => {}); picked = true; } }
      L('nodo', picked ? 'selezionato' : 'NON in lista');
      await page.waitForTimeout(600);
      await conferma.click({ timeout: 6000 }).catch(e => L('conferma err', e.message));
      await page.waitForTimeout(4000);
      L('post-CONFERMA url=', page.url());
    } else L('nessuna videata nodo (già in home)');
  } catch (e) { L('nodo/conferma err', e.message); }
  // 2) HOME → EMISSIONI FAST: N. Targa + Data Nascita → QUOTA
  await page.waitForTimeout(1500);
  let targaOk = false;
  for (const sel of ['input[placeholder*="Targa" i]', 'input[aria-label*="Targa" i]', 'input[name*="targa" i]', 'input[id*="targa" i]']) {
    const el = page.locator(sel).first();
    if (await el.count().catch(() => 0)) { try { await el.fill(targa, { timeout: 5000 }); targaOk = true; L('targa in', sel); break; } catch {} }
  }
  if (!targaOk) { try { await page.getByLabel(/targa/i).first().fill(targa, { timeout: 4000 }); targaOk = true; L('targa via label'); } catch (e) { L('targa NON inserita', e.message); } }
  // RECUPERO PRIMO PREVENTIVO A FREDDO: se la targa non si inserisce, la home EMISSIONI FAST non è pronta
  // (login a metà flusso non ancora assestato). Rifaccio login + ritorno alla home, gestisco l'eventuale
  // videata nodo, e riprovo ad agganciare il campo targa per ~20s. Risolve il "QUOTA non trovato" iniziale.
  if (!targaOk) {
    L('targa assente → recupero: re-login + home + nodo');
    try { await ensureLogin(); } catch (e) { L('recupero ensureLogin err', e.message); }
    await page.goto(APP_HOME, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(3500);
    try {
      const conferma = page.getByRole('button', { name: /^\s*conferma\s*$/i }).first();
      if (await conferma.count().catch(() => 0)) {
        for (const sel of ['mat-select', '[role=combobox]', 'select', 'input']) { const el = page.locator(sel).first(); if (await el.count().catch(() => 0)) { await el.click({ timeout: 4000 }).catch(() => {}); break; } }
        await page.waitForTimeout(900); await page.keyboard.type(String(HDI_NODO)).catch(() => {}); await page.waitForTimeout(1100);
        const opt = page.getByRole('option', { name: new RegExp(HDI_NODO) }).first();
        if (await opt.count().catch(() => 0)) await opt.click({ timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(600); await conferma.click({ timeout: 6000 }).catch(() => {}); await page.waitForTimeout(4000);
      }
    } catch (e) {}
    for (let i = 0; i < 10 && !targaOk; i++) {
      await page.waitForTimeout(1500);
      for (const sel of ['input[placeholder*="Targa" i]', 'input[aria-label*="Targa" i]', 'input[name*="targa" i]', 'input[id*="targa" i]']) {
        const el = page.locator(sel).first();
        if (await el.count().catch(() => 0)) { try { await el.fill(targa, { timeout: 5000 }); targaOk = true; L('targa in (recupero)', sel); break; } catch {} }
      }
    }
    L(targaOk ? 'recupero riuscito (targa inserita)' : 'targa NON inserita anche dopo recupero');
  }
  if (nascita) {
    for (const sel of ['input[placeholder*="Nascita" i]', 'input[aria-label*="Nascita" i]', 'input[name*="nascita" i]', 'input[id*="nascita" i]']) {
      const el = page.locator(sel).first();
      if (await el.count().catch(() => 0)) { try { await el.fill(nascita, { timeout: 4000 }); L('nascita in', sel); break; } catch {} }
    }
  }
  await page.waitForTimeout(600);
  // Click su QUOTA PAZIENTE: dopo un auto-login a metà flusso la home "EMISSIONI FAST" può renderizzare
  // tardi (il bottone non c'è ancora o è coperto). Attendo, riprovo, e ho un click JS nativo di riserva.
  let quotaOk = false;
  for (let i = 0; i < 8 && !quotaOk; i++) {
    const quota = page.getByRole('button', { name: /^\s*quota\s*$/i }).first();
    if (await quota.count().catch(() => 0)) { try { await quota.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {}); await quota.click({ timeout: 4000 }); quotaOk = true; L('QUOTA cliccato'); break; } catch (e) { L('QUOTA err', e.message); } }
    try { const t = page.getByText(/^\s*quota\s*$/i).first(); if (await t.count().catch(() => 0)) { await t.click({ timeout: 2500 }); quotaOk = true; L('QUOTA via text'); break; } } catch (e) {}
    await page.waitForTimeout(1500);
  }
  if (!quotaOk) { // ultima spiaggia: click JS nativo sull'elemento col testo QUOTA
    quotaOk = await page.evaluate(() => { const el = [...document.querySelectorAll('button,a,input[type=submit],[role=button]')].find(e => /^\s*quota\s*$/i.test((e.innerText || e.value || '').trim())); if (el) { el.click(); return true; } return false; }).catch(() => false);
    L(quotaOk ? 'QUOTA via JS' : 'QUOTA non trovato');
  }
  // 3) attende l'assumption e legge il PREMIO ANNUALE LORDO. Preferisco l'API (verità sul filo)
  // alla pagina SPA: cerco nelle risposte sniffate gwm.hdia.it un campo "premio*ann/lord/tot" > 0.
  function deepFindPremio(o, depth = 0) {
    if (!o || depth > 7) return null;
    if (Array.isArray(o)) { for (const x of o) { const r = deepFindPremio(x, depth + 1); if (r) return r; } return null; }
    if (typeof o === 'object') {
      for (const k of Object.keys(o)) {
        const v = o[k];
        if ((typeof v === 'number' || typeof v === 'string') && /premio/i.test(k) && /(ann|lord|tot|rata)/i.test(k)) {
          const n = typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.'));
          if (n && n > 0) return { key: k, val: v, num: n };
        }
      }
      for (const k of Object.keys(o)) { const r = deepFindPremio(o[k], depth + 1); if (r) return r; }
    }
    return null;
  }
  let premio = null, premioNum = null, premioSrc = null, premioKey = null;
  for (let i = 0; i < 55; i++) {
    await page.waitForTimeout(1500);
    // (a) API: scorro le risposte JSON sniffate cercando il campo premio
    for (const e of SNIFF.buf) {
      if (e.kind !== 'res' || !/gwm\.hdia/.test(e.url || '')) continue;
      let j; try { j = JSON.parse(e.body); } catch { continue; }
      const hit = deepFindPremio(j);
      if (hit) { premioNum = hit.num; premio = typeof hit.val === 'string' ? hit.val : hit.num.toFixed(2).replace('.', ','); premioKey = hit.key; premioSrc = 'api:' + ((e.url.split('/uefa/')[1] || '').slice(0, 40)); break; }
    }
    if (premio) break;
    // (b) fallback pagina: "Premio Annuale … €X,XX" con X>0 (evito lo 0,00 dei placeholder)
    const pp = await page.evaluate(() => {
      const t = document.body.innerText || '';
      let m = t.match(/Premio\s*Annuale[\s\S]{0,60}?€?\s*([\d.]+,\d{2})/i);
      if (!m) m = t.match(/€\s*([\d.]+,\d{2})\s*\n?\s*lordo/i);
      return m ? m[1] : null;
    }).catch(() => null);
    if (pp && pp !== '0,00') { premio = pp; premioNum = Number(pp.replace(/\./g, '').replace(',', '.')); premioSrc = 'page'; break; }
  }
  L('premio:', premio || 'NULL', 'src=', premioSrc || '-', 'key=', premioKey || '-', 'url=', page.url());
  // garanzie (Gestione Garanzie): elementi "<prezzo> €" col nome accanto
  const garanzie = await page.evaluate(() => {
    const out = []; const seen = new Set();
    for (const el of document.querySelectorAll('div,span,td')) {
      if (el.childElementCount) continue;
      const m = (el.textContent || '').trim().match(/^([\d.]+,\d{2})\s*€$/);
      if (!m) continue;
      const cont = el.closest('div');
      const nome = cont ? (cont.innerText || '').replace(m[0], '').trim().split('\n')[0].slice(0, 50) : '';
      const key = nome + '|' + m[1];
      if (nome && !seen.has(key)) { seen.add(key); out.push({ nome, premio: m[1] }); }
    }
    return out.slice(0, 30);
  }).catch(() => []);
  const sniff = sniffStop();
  const api = sniff.filter(e => /gwm\.hdia/.test(e.url || '')).map(e => ({ k: e.kind, m: e.method, s: e.status, url: (e.url || '').slice(0, 200), body: String(e.body || '').slice(0, 1500) }));
  return { ok: premioNum != null && premioNum > 0, compagnia: 'HDI Assicurazioni', targa, premio_annuale: premio, premio_annuale_num: premioNum, premio_src: premioSrc, premio_key: premioKey, garanzie, url: page.url(), log, api };
}

// ── PREMIO da Plurima: pilota il wizard fino allo step Preventivo, forza il ricalcolo e legge
// il risultato del job calcola_preventivo (status 2). Ritorna il premio strutturato. Gestisce
// anche il Bersani (opzione "Da altro veicolo del proprietario" + targa di provenienza).
async function drivePremio(targa, sitLabel = 'Rinnovo', opts = {}) {
  const bersaniTarga = (opts.bersaniTarga || '').toUpperCase().trim();
  const garanzie = Array.isArray(opts.garanzie) ? opts.garanzie : [];
  await ensureOnPortal();
  await page.goto(origin(creds().loginUrl) + '/auto', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2200);
  sniffStart();
  const anagrafica = opts.anagrafica && typeof opts.anagrafica === 'object' ? opts.anagrafica : null;
  const drive = await page.evaluate(async ({ targa, sitLabel, bersaniTarga, garanzie, anagrafica }) => {
    const log = []; const $ = window.jQuery; const sleep = ms => new Promise(r => setTimeout(r, ms));
    const stepAttivo = () => { const a = document.querySelector('#steps_preventivatore .current a, .wizard .current a, .steps .current a'); return a ? (a.textContent || '').trim() : '?'; };
    const popup = () => { const p = document.querySelector('.swal2-popup, .sweet-alert, .swal-modal'); return p ? (p.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160) : null; };
    const chiudiPopup = () => { const b = document.querySelector('.swal2-confirm, .sweet-alert .confirm, .swal-button--confirm'); if (b) b.click(); };
    try {
      if (!$) return { error: 'jQuery assente' };
      const t = $('#targa'); if (!t.length) return { error: '#targa assente' };
      t.val(targa).trigger('input').trigger('keyup').trigger('change').trigger('blur');
      for (let i = 0; i < 30 && !$('#situazione_assicurativa').length; i++) await sleep(500);
      if (!$('#situazione_assicurativa').length) return { error: 'situazione non caricata' };
      $('#situazione_assicurativa').val(sitLabel).trigger('change');
      await sleep(1200);
      // Bersani: opzione "Da altro veicolo del proprietario" + targa di provenienza
      if (bersaniTarga) {
        const bp = document.getElementById('bersani_provenienza');
        if (bp) {
          const imp = [...bp.options].find(o => o.value && !/^no$/i.test(o.value));
          if (imp) { $(bp).val(imp.value).trigger('change'); await sleep(900); }
          const tp = document.getElementById('targa_provenienza');
          if (tp) { $(tp).val(bersaniTarga).trigger('input').trigger('change').trigger('blur'); await sleep(1500); }
        }
      }
      // helper per compilare un campo (input/select) con eventi jQuery
      const setCampo = (id, val) => { const el = document.getElementById(id); if (!el || val == null || val === '') return false; el.focus(); el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('keyup', { bubbles: true })); if ($) { try { $(el).trigger('input').trigger('change').trigger('blur'); } catch (e) {} } el.dispatchEvent(new Event('blur', { bubbles: true })); return true; };
      // avanzo fino al Preventivo: compilo Anagrafiche (Voltura) e l'allestimento sullo step Veicolo
      let anagFatta = false;
      for (let k = 0; k < 8; k++) {
        // ANAGRAFICHE (Voltura/nuovo): il contraente NON arriva dall'attestato → compilo CF + indirizzo.
        // Il portale ricava nome/cognome/nascita dal CF; in Rinnovo questo step è già compilato e si salta.
        if (anagrafica && anagrafica.cf && !anagFatta && /anagra/i.test(stepAttivo())) {
          // Compilo SOLO se il CF contraente è vuoto: in Rinnovo lo step è già valorizzato
          // dall'attestato e non va toccato; in Voltura/nuovo è vuoto e va compilato.
          const cfEl = document.getElementById('codice_fiscale_contraente');
          if (cfEl && !String(cfEl.value || '').trim()) {
            const cf = String(anagrafica.cf).toUpperCase().trim();
            const ind = anagrafica.indirizzo || [anagrafica.via || anagrafica.indirizzo_via, anagrafica.civico, anagrafica.cap, anagrafica.comune, anagrafica.prov].filter(Boolean).join(' ');
            setCampo('codice_fiscale_proprietario', cf);
            setCampo('codice_fiscale_contraente', cf);
            await sleep(2800); // attende il lookup del CF (nome/cognome derivati)
            let pp0 = popup(); if (pp0) { log.push('popup CF: ' + pp0); chiudiPopup(); await sleep(700); }
            if (ind) { setCampo('indirizzo_proprietario', ind); setCampo('indirizzo_contraente', ind); await sleep(1500); }
            log.push('anagrafica compilata: cf=' + cf + ' ind=' + (ind ? 'sì' : 'no'));
          } else log.push('anagrafica: già valorizzata (Rinnovo) → non tocco');
          anagFatta = true;
        }
        if (/veicolo/i.test(stepAttivo())) {
          let as = null;
          for (let w = 0; w < 18; w++) { as = document.querySelector('select[id*=allestimento i], select[name*=allestimento i]'); if (as && [...as.options].some(o => o.value)) break; await sleep(500); }
          if (as && !as.value) { const opt = [...as.options].find(o => o.value); if (opt) { $(as).val(opt.value).trigger('change'); await sleep(3000); } }
        }
        if (/preventiv/i.test(stepAttivo())) break;
        const nextA = document.querySelector('a[href="#next"], .actions a[href="#next"], a[href$="next"]');
        if (!nextA) break;
        nextA.click(); await sleep(3500);
        const pp = popup(); if (pp) { log.push('popup: ' + pp); chiudiPopup(); await sleep(800); }
      }
      log.push('step: ' + stepAttivo());
      // ATTIVO le garanzie ARD/CVT richieste (selezionaGaranzia('<key>') → div#garanzia_<key> selezionata)
      const attivate = [];
      if (garanzie && garanzie.length && typeof selezionaGaranzia === 'function') {
        for (const g of garanzie) {
          try {
            const div = document.getElementById('garanzia_' + g);
            if (div && !/selezionata/.test(div.className)) {
              selezionaGaranzia(g); attivate.push(g);
              await sleep(2200);
              const pp = popup(); if (pp) { log.push('popup attivazione ' + g + ': ' + pp); chiudiPopup(); await sleep(800); }
            } else log.push('garanzia ' + g + ': ' + (div ? 'già attiva o ' + div.className.slice(0, 30) : 'div assente'));
          } catch (e) { log.push('attiva ' + g + ' err: ' + e.message); }
        }
        log.push('garanzie attivate: ' + JSON.stringify(attivate));
      }
      // GUIDA ESPERTA: spunto la clausola "Conducente esperto" (riduce il premio)
      let guidaEspertaSet = false;
      try {
        let ce = null;
        for (const cb of document.querySelectorAll('input[type=checkbox]')) {
          const ctx = ((cb.closest('label,div,.clausola,td,li,.form-check') || {}).innerText || '') + ' ' + (cb.id || '') + ' ' + (cb.name || '');
          if (/conducente.?esperto|guida.?espert/i.test(ctx)) { ce = cb; break; }
        }
        if (ce && !ce.checked) { ce.click(); if (window.jQuery) jQuery(ce).trigger('change'); guidaEspertaSet = true; log.push('conducente esperto: spuntato'); await sleep(2500); }
        else log.push('conducente esperto: ' + (ce ? 'già spuntato' : 'checkbox non trovato'));
      } catch (e) { log.push('conducente esperto err: ' + e.message); }
      // forzo un primo ricalcolo (change massimale_rc) per riflettere garanzie + guida esperta
      // e far ri-renderizzare il pannello sconto (#div_scontistica_auto / btn_applica_sconto_<idtariffa>)
      try { const mr = document.getElementById('massimale_rc'); if (mr) jQuery(mr).trigger('change'); } catch (e) {}
      // SCONTO MASSIMO — uso le funzioni NATIVE del portale (preventivatore_auto.js):
      //   setValoreScontoTariffaAuto(idt, max) imposta lo sconto, applicaScontoAuto(idt) ricalcola.
      //   Il pannello sconto compare SOLO dopo un calcolo: attendo il pulsante btn_applica_sconto_<idt>.
      let scontoApplicato = null;
      try {
        // NB: `tariffe` è una `let` globale (binding lessicale) → NON è su window.
        // L'eval indiretto la legge nello scope globale della pagina (così le funzioni).
        const G = (name) => { try { return (0, eval)(name); } catch { return undefined; } };
        let idt = null;
        for (let w = 0; w < 16; w++) {
          const btn = document.querySelector('[id^="btn_applica_sconto_"]');
          if (btn) { idt = parseInt((btn.id.match(/(\d+)$/) || [])[1], 10) || null; break; }
          await sleep(1500);
        }
        const quotazioniArr = G('quotazioni'); const tariffeArr = G('tariffe');
        const setVal = G('setValoreScontoTariffaAuto'); const applica = G('applicaScontoAuto');
        const getMax = G('getScontoConsigliatoMassimoAuto');
        if (idt != null && typeof setVal === 'function' && typeof applica === 'function') {
          let maxSc = null;
          // il pannello sconto è costruito da `quotazioni` (chiave idtariffa, SENZA underscore,
          // con sconto_consigliato/sconto_tariffa); `tariffe` (id_tariffa) è solo un fallback.
          let q = (Array.isArray(quotazioniArr) ? quotazioniArr : []).find(x => String(x.idtariffa) === String(idt));
          if (!q) q = (Array.isArray(tariffeArr) ? tariffeArr : []).find(t => String(t.id_tariffa) === String(idt));
          if (q && typeof getMax === 'function') maxSc = getMax(q);
          // fallback diretto sui campi consigliati se la helper torna null
          if (!(maxSc > 0) && q) { const v = parseFloat(q.sconto_tariffa ?? q.sconto_consigliato_originale ?? q.sconto_consigliato); if (v > 0) maxSc = v; }
          log.push('sconto: quotazioni=' + (Array.isArray(quotazioniArr) ? quotazioniArr.length : 'n/d') + ' tariffe=' + (Array.isArray(tariffeArr) ? tariffeArr.length : 'n/d') + ' q=' + (q ? 'ok' : 'no') + ' campi=' + (q ? JSON.stringify({ t: q.sconto_tariffa, o: q.sconto_consigliato_originale, c: q.sconto_consigliato }) : '-') + ' max=' + maxSc);
          if (maxSc > 0) {
            setVal(idt, maxSc);
            scontoApplicato = maxSc;
            log.push('sconto max ' + maxSc + '% impostato su tariffa ' + idt);
            await applica(idt); // imposta appliedSliderValues + eseguiCalcolo(true)
            log.push('applicaScontoAuto(' + idt + ') eseguito');
          } else log.push('sconto: massimo non determinato (tariffa ' + idt + (q ? '' : ', quotazione assente') + ')');
        } else log.push('sconto: funzioni native assenti o pannello non comparso (idt=' + idt + ')');
      } catch (e) { log.push('sconto err: ' + e.message); }
      await sleep(17000 + attivate.length * 6000 + ((guidaEspertaSet || scontoApplicato) ? 7000 : 0));
      // config garanzie a video (per riferimento)
      const conf = {};
      ['frazionamento', 'massimale_rc'].forEach(id => { const e = document.getElementById(id); if (e) conf[id] = e.value; });
      return { ok: true, step: stepAttivo(), conf, guidaEspertaSet, scontoApplicato, log };
    } catch (e) { return { error: e.message, log }; }
  }, { targa, sitLabel, bersaniTarga, garanzie, anagrafica });
  const buf = sniffStop();
  // estraggo il job calcola_preventivo completato con premio (preferisco premio>0)
  let premio = null;
  try {
    const jobs = buf.filter(e => e.kind === 'res' && /"jobid"/.test(e.body || ''))
      .map(e => { try { return JSON.parse(e.body); } catch { return null; } }).filter(Boolean)
      .filter(j => String(j.status) === '2' && j.result && j.result.data);
    // l'ULTIMO job con premio>0 riflette la configurazione finale (garanzie + guida esperta + sconto applicato)
    const conP = [...jobs].reverse().find(j => (j.result.data.message || []).some(p => Number(p.premio_annuale) > 0));
    const scelto = conP || jobs[jobs.length - 1];
    const p = scelto && (scelto.result.data.message || [])[0];
    if (p) {
      premio = {
        prodotto: p.nomeprodotto, compagnia: p.idcompagnia, tariffa: p.idtariffa,
        premio_annuale: p.premio_annuale, premio_rata: p.premio_rata, premio_imponibile: p.premio_imponibile,
        frazionamento: p.frazionamento, sconto_quotazione: p.sconto_quotazione, sconto_tariffa: p.sconto_tariffa,
        data_effetto: p.data_effetto, data_scadenza: p.data_scadenza,
        garanzie: (p.garanzie || []).map(g => ({ nome: g.nome, premio: g.premio })),
      };
    }
  } catch (e) { premio = { error: e.message }; }
  if (!drive || drive.error) return { ok: false, error: (drive && drive.error) || 'drive fallito', log: drive && drive.log, premio };
  return { ok: !!(premio && premio.premio_annuale > 0), targa, situazione: sitLabel, bersani_da: bersaniTarga || null, garanzie_richieste: garanzie, step: drive.step, log: drive.log, premio };
}

http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const u = new URL(req.url, 'http://x');
    if (u.pathname.startsWith('/status')) {
      const c = creds();
      return res.end(JSON.stringify({ url: page.url(), loggato: !isLoginUrl(page.url()) && !(await hasPasswordField()) && !(await isPublicLanding()), ha_credenziali: !!(c.username && c.password) }));
    }
    if (u.pathname.startsWith('/login')) {
      const done = await locked(() => ensureLogin().catch(e => (log('login err:', e.message), false)));
      await page.screenshot({ path: 'shots/login.png', fullPage: true }).catch(() => {});
      return res.end(JSON.stringify({ ok: done, url: page.url() }));
    }
    if (u.pathname.startsWith('/casaprobe')) {
      // SONDA per la Casa (API diretta): scopre DOVE sta il token UEFA e se una chiamata
      // diretta a gwm.hdia.it funziona. Non ritorna il token (solo i nomi delle chiavi + esito).
      const out = await locked(async () => {
        await ensureLogin().catch(() => {}); // best-effort: la sonda rivela da sé se il token c'è
        await page.goto(APP_HOME, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
        await page.waitForTimeout(3000);
        // Il template va letto in NODE (fs non esiste nel browser) e passato alla evaluate.
        let CASA_TPL = null; try { CASA_TPL = JSON.parse(fs.readFileSync(new URL('./casa-template.json', import.meta.url), 'utf8')); } catch (e) {}
        return page.evaluate(async (CASA_TPL) => {
          const o = { origin: location.origin, tokenKeys: [], hasToken: false, probe: null, tplLoaded: !!CASA_TPL };
          let token = null;
          const isJwt = v => typeof v === 'string' && /^eyJ[\w-]+\.[\w-]+\./.test(v);
          for (const store of [localStorage, sessionStorage]) {
            for (let i = 0; i < store.length; i++) {
              const k = store.key(i); const v = store.getItem(k) || '';
              if (isJwt(v)) { o.tokenKeys.push(k); if (!token) token = v; }
              else { try { const j = JSON.parse(v); for (const kk of Object.keys(j || {})) { if (isJwt(j[kk])) { o.tokenKeys.push(k + '.' + kk); if (!token) token = j[kk]; } } } catch (e) {} }
            }
          }
          o.hasToken = !!token;
          const nodo = '1428';
          const h = { 'Content-Type': 'application/json', 'nodecode': nodo };
          if (token) h['Authorization'] = 'Bearer ' + token;
          const call = async (url, body) => { try { const r = await fetch(url, { method: 'POST', headers: h, credentials: 'include', body: JSON.stringify(body) }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} return { status: r.status, len: t.length, head: t.slice(0, 400), json: j }; } catch (e) { return { error: String(e && e.message || e) }; } };
          o.prodotti = await call('https://gwm.hdia.it/uefa/user/getProdottiVendibili', { codiceNodo: nodo });
          const init = await call('https://gwm.hdia.it/uefa/fastmotor/passprodotti/inizializzaAssumption', {
            idProdotto: '295', parametri: { CONVENZIONI: null, FRAZIONAMENTO: '000001', CODICENODO: nodo, CODICE_PRODOTTO: '544', DATA_EFFETTO: '01/07/2026', CATEGORIA_CLIENTE: 1, TIPO_ABITAZIONE: 1, SOMMA_ASSICURATA: 250000, PROV_RESIDENZA_ASSIC: 'TP', GESTIONE_PROPOSTA: false },
            listaBeni: [{ codiceBene: '000366', datiBene: { datiAnagrafici: {}, beneAssicurato: { indirizzo: { siglaStato: 'IT', siglaNazione: 'IT', provincia: 'TP' } } }, idBene: 0 }]
          });
          o.casaInit = { status: init.status, len: init.len, head: init.head, topKeys: init.json && typeof init.json === 'object' ? Object.keys(init.json) : null };
          // CATENA (Path B-lite): rigioco il corpo /uefa/quotazione CATTURATO (template, che HA prodotto
          // premio), aggiornando solo le date. Nel body reale datiAnagrafici è {} (il premio Casa dipende
          // solo dall'abitazione), quindi niente contraente.
          if (CASA_TPL) try {
            const tpl = JSON.parse(JSON.stringify(CASA_TPL));
            const D = off => { const dt = new Date(Date.now() + off * 86400000); const p = n => String(n).padStart(2, '0'); return p(dt.getDate()) + '/' + p(dt.getMonth() + 1) + '/' + dt.getFullYear(); };
            if (tpl.parametri) { tpl.parametri.dataEmissione = D(0); tpl.parametri.dataEffetto = D(0); tpl.parametri.dataScadenza = D(365); tpl.parametri.dataScadenzaCopertura = D(365); }
            o.tplBytes = JSON.stringify(tpl).length;
            const contrT = await call('https://gwm.hdia.it/uefa/quotazione/controlliDeroga', tpl);
            o.tplControlli = { status: contrT.status, error: contrT.error || null, err: contrT.status >= 400 ? contrT.head : null };
            const quotT = await call('https://gwm.hdia.it/uefa/quotazione', tpl);
            o.tplQuot = { status: quotT.status, error: quotT.error || null, len: quotT.len, err: quotT.status >= 400 ? quotT.head : null };
            if (quotT.json) { const s = JSON.stringify(quotT.json); const premi = []; const re = /"(lordo|netto|imposte|descrizione)"\s*:\s*("[^"]{0,40}"|[\d.]+)/gi; let mm, n = 0; while ((mm = re.exec(s)) && n < 30) { premi.push(mm[1] + '=' + mm[2]); n++; } o.tplQuot.premi = premi; }
          } catch (e) { o.tplErr = String(e && e.message || e); }
          if (init.json && typeof init.json === 'object') {
            const ij = init.json;
            const D = off => { const dt = new Date(Date.now() + off * 86400000); const p = n => String(n).padStart(2, '0'); return p(dt.getDate()) + '/' + p(dt.getMonth() + 1) + '/' + dt.getFullYear(); };
            const contraente = { birthDate: '17/07/1993', birthPlace: 'MARSALA', cittadinanza1: 'IT', codice_fiscale: 'RSSMRA93L17E974P', cognome: 'ROSSI', nome: 'MARIO', denominazione: 'ROSSI MARIO', sesso: 'M', nazNascita: 'IT', provNascita: 'TP', indirizzo: { provincia: 'TP', comune: 'MARSALA', toponimo: 'VIA', indirizzo: 'ROMA', civico: '1', cap: '91025', siglaNazione: 'IT' } };
            const b0 = a => Array.isArray(a) ? (a[0] || {}) : a; // init da' fattoriBene/clausoleBene/garanzie come ARRAY per-bene; la quotazione vuole il singolo elemento
            const qb = {
              codiceProdotto: '544', idProdotto: '295',
              parametri: { dataEmissione: D(0), dataEffetto: D(0), oraEffetto: '24:00', dataScadenza: D(365), frazionamento: '000001', dataScadenzaCopertura: D(365), convenzione: null, categoriaCliente: 1, usoImposta: 1, codiceProduttore: 'A4123', segnalatore: '', coassicurazione: '1', percentualeNostra: '', testoLibero: '', vincolo: false, giorniDisdetta: 30, indicizzazione: true, tacitoRinnovo: true, versioneProdotto: 4, codiceTipoIndice: '000024' },
              fattoriPolizza: ij.fattoriPolizza, clausolePolizza: ij.clausolePolizza,
              beni: [{ codiceBene: '000366', datiBene: { datiAnagrafici: { contraente }, beneAssicurato: { indirizzo: { siglaStato: 'IT', siglaNazione: 'IT', provincia: 'TP' } } }, clausoleBene: b0(ij.clausoleBene), fattoriBene: b0(ij.fattoriBene), warningDaAutorizzare: false, garanzie: b0(ij.garanzie), indiceBene: 0 }],
              segnalazioni: ij.segnalazioni || {}, altreSegnalazioni: {}, questionarioIDD: [], dataQuestionarioIDD: { prodottoSelezionato: [], risposteQuestionario: [] }, questionarioIddLast: false, iddAdeguato: null, provenienzaSconti: false, nascondiDettPremio: true, backQuotazione: false, giorniReg51: 60, rischioComune: { visibile: true, obbligatorio: false }, coassIndiretta: { visibile: false, obbligatorio: false }, questionariSanitari: [], sezioniGaranzie: ij.sezioniGaranzie, nodoEmissione: nodo, idPv: '143290000000000000' }
            ;
            // handshake statefull passo 1: aggiornaGaranzie (popola lo stato garanzie/premio).
            const agBody = {
              codiceProdotto: '544', idProdotto: '295',
              dominioValori: { DATAEFFETTO: D(0), CONVENZIONI: null, FRAZIONAMENTO: '000001', DATA_SCADENZA: D(365), CODICENODO: nodo, VINCOLO: 0, TACITO_RINNOVO: 1, INDICIZZAZIONE: true, ID_VERSIONE: 4, CATEGORIA_CLIENTE: 1, USOIMPOSTA: 1, USOIMPOSTAPREV: 1, PROV_RESIDENZA_ASSIC: 'TP', COASS: '1' },
              parametri: qb.parametri, fattoriPolizza: ij.fattoriPolizza, clausolePolizza: ij.clausolePolizza,
              listaBeni: [{ codiceBene: '000366', datiBene: qb.beni[0].datiBene, clausoleBene: b0(ij.clausoleBene), fattoriBene: b0(ij.fattoriBene), garanzie: b0(ij.garanzie), warningDaAutorizzare: false, idBene: 0 }]
            };
            const ag = await call('https://gwm.hdia.it/uefa/fastmotor/passprodotti/aggiornaGaranzie', agBody);
            o.casaAggiorna = { status: ag.status, err: ag.status >= 400 ? ag.head : null };
            // uso la risposta di aggiornaGaranzie per aggiornare lo stato nel corpo quotazione
            if (ag.json && typeof ag.json === 'object') {
              const aj = ag.json;
              if (aj.fattoriPolizza) qb.fattoriPolizza = aj.fattoriPolizza;
              if (aj.clausolePolizza) qb.clausolePolizza = aj.clausolePolizza;
              if (aj.sezioniGaranzie) qb.sezioniGaranzie = aj.sezioniGaranzie;
              if (aj.fattoriBene) qb.beni[0].fattoriBene = b0(aj.fattoriBene);
              if (aj.clausoleBene) qb.beni[0].clausoleBene = b0(aj.clausoleBene);
              if (aj.items) qb.beni[0].garanzie = b0(aj.items);
            }
            // handshake statefull passo 2: controlliDeroga PRIMA della quotazione (come nella cattura)
            const contr = await call('https://gwm.hdia.it/uefa/quotazione/controlliDeroga', qb);
            o.casaControlli = { status: contr.status, len: contr.len, err: contr.status >= 400 ? contr.head : null };
            const quot = await call('https://gwm.hdia.it/uefa/quotazione', qb);
            o.casaQuot = { status: quot.status, len: quot.len, err: quot.status >= 400 ? quot.head : null };
            if (quot.json) { const s = JSON.stringify(quot.json); const premi = []; const re = /"(lordo|netto|imposte|descrizione)"\s*:\s*("[^"]{0,40}"|[\d.]+)/gi; let mm, n = 0; while ((mm = re.exec(s)) && n < 24) { premi.push(mm[1] + '=' + mm[2]); n++; } o.casaQuot.premi = premi; }
          }
          return o;
        }, CASA_TPL).catch(e => ({ ok: false, error: String(e && e.message || e) }));
      });
      return res.end(JSON.stringify(out, null, 2));
    }
    if (u.pathname.startsWith('/premio-casa')) {
      // PREVENTIVO GLOBALE CASA 2019 (HDI prodotto 295) via API diretta UEFA: replay del template
      // catturato con patch dei fattori abitazione + provincia + date → controlliDeroga → quotazione.
      // Params: ?provincia=TP&tipo=1|5|6&mq=1|2|3&dimora=1|2|3&piano=1|2|3&cc=1|2|3&eta=1|5|6|4&effetto=GG/MM/AAAA
      const g = k => (u.searchParams.get(k) || '').trim();
      const out = await locked(async () => {
        if (!(await ensureLogin().catch(() => false))) { /* best-effort */ }
        await page.goto(APP_HOME, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
        await page.waitForTimeout(2500);
        // template + patch (in NODE)
        let tpl = null; try { tpl = JSON.parse(fs.readFileSync(new URL('./casa-template.json', import.meta.url), 'utf8')); } catch (e) { return { ok: false, error: 'template Casa non caricato: ' + e.message }; }
        const p2 = n => String(n).padStart(2, '0');
        const D = off => { const dt = new Date(Date.now() + off * 86400000); return p2(dt.getDate()) + '/' + p2(dt.getMonth() + 1) + '/' + dt.getFullYear(); };
        const eff = /^\d{2}\/\d{2}\/\d{4}$/.test(g('effetto')) ? g('effetto') : D(0);
        const effDt = (() => { const [d1, m1, y1] = eff.split('/').map(Number); return new Date(y1, m1 - 1, d1); })();
        const scad = (() => { const dt = new Date(effDt.getTime()); dt.setFullYear(dt.getFullYear() + 1); return p2(dt.getDate()) + '/' + p2(dt.getMonth() + 1) + '/' + dt.getFullYear(); })();
        if (tpl.parametri) { tpl.parametri.dataEmissione = D(0); tpl.parametri.dataEffetto = eff; tpl.parametri.dataScadenza = scad; tpl.parametri.dataScadenzaCopertura = scad; }
        const arr = (tpl.beni && tpl.beni[0] && tpl.beni[0].fattoriBene && tpl.beni[0].fattoriBene.ALL) || [];
        const setF = (cod, val) => { if (val === '' || val == null) return; const f = arr.find(x => (x.codiceFattore || x.codice) === cod); if (f) f.valore = isNaN(+val) ? val : +val; };
        setF('2TIPAB', g('tipo')); setF('2MQL', g('mq')); setF('2DIMOR', g('dimora')); setF('2PIAN', g('piano')); setF('2CC', g('cc')); setF('2EFA', g('eta'));
        const prov = g('provincia').toUpperCase();
        try { if (prov) tpl.beni[0].datiBene.beneAssicurato.indirizzo.provincia = prov; } catch (e) {}
        // GARANZIE parametriche: ?garanzie=cod1,cod2,… → per ogni rischio setto
        // selected = (codice ∈ lista). Se il param NON è passato, lascio i default del template.
        // Così "solo RC" seleziona solo i codici RC e disattiva il resto.
        const garSel = g('garanzie');
        const want = garSel ? new Set(garSel.split(',').map(s => s.trim()).filter(Boolean)) : null;
        if (want) {
          try {
            const rischi = (tpl.beni[0].garanzie && tpl.beni[0].garanzie.rischi) || {};
            for (const sez of Object.keys(rischi)) {
              const list = rischi[sez];
              if (Array.isArray(list)) list.forEach(gg => { if (gg && gg.codice != null) gg.selected = want.has(String(gg.codice)); });
            }
          } catch (e) {}
        }
        // SOMME ASSICURATE LIBERE: valore fabbricato → 3SA di 081035 (Incendio Fabbricato),
        // valore contenuto → 3SA di 081036 (Incendio Contenuto) e 091047 (Furto contenuto).
        // Il fattore 3SA sta dentro garanzia.fattoriRischio. Senza param resta il valore del template.
        const setSA = (codice, val) => {
          try {
            const rischi = (tpl.beni[0].garanzie && tpl.beni[0].garanzie.rischi) || {};
            for (const sez of Object.keys(rischi)) {
              const gg = (rischi[sez] || []).find(x => String(x.codice) === codice);
              if (gg && Array.isArray(gg.fattoriRischio)) {
                const sa = gg.fattoriRischio.find(f => f.codiceFattore === '3SA');
                if (sa) sa.valore = val;
              }
            }
          } catch (e) {}
        };
        const vFab = parseInt(g('valfabbricato'), 10);
        const vCon = parseInt(g('valcontenuto'), 10);
        if (vFab > 0) setSA('081035', vFab);
        if (vCon > 0) { setSA('081036', vCon); setSA('091047', vCon); }
        // RC: patch dei fattoriRischio — massimale (3MVPC, dominio 1..8), estensione
        // B&B/Affittacamere (3EBB 0/1), estensione cani/animali da sella (3ECP 0/1).
        // 131065/135032 = RC famiglia (vita privata), 131067 = RC proprietà. I mirror
        // "_SCORPORAFAT_" dentro 131065 vanno allineati.
        const setFR = (garCod, base, val) => {
          try {
            const rischi = (tpl.beni[0].garanzie && tpl.beni[0].garanzie.rischi) || {};
            for (const sez of Object.keys(rischi)) for (const gg of (rischi[sez] || [])) {
              if (String(gg.codice) !== garCod) continue;
              for (const f of (gg.fattoriRischio || [])) {
                if (f.codiceFattore === base || (typeof f.codiceFattore === 'string' && f.codiceFattore.startsWith(base + '_SCORPORAFAT_'))) f.valore = val;
              }
            }
          } catch (e) {}
        };
        const rcMassV = parseInt(g('rcmassvita'), 10), rcMassP = parseInt(g('rcmassprop'), 10);
        if (rcMassV >= 1 && rcMassV <= 8) { setFR('131065', '3MVPC', rcMassV); setFR('135032', '3MVPC', rcMassV); }
        if (rcMassP >= 1 && rcMassP <= 8) setFR('131067', '3MVPC', rcMassP);
        if (g('bnbvita') !== '') { const v = g('bnbvita') === '1' ? 1 : 0; setFR('131065', '3EBB', v); setFR('135032', '3EBB', v); }
        if (g('bnbprop') !== '') setFR('131067', '3EBB', g('bnbprop') === '1' ? 1 : 0);
        if (g('animalivita') !== '') { const v = g('animalivita') === '1' ? 1 : 0; setFR('131065', '3ECP', v); setFR('135032', '3ECP', v); }
        if (vFab > 0) setFR('131067', '2RIC', vFab);
        // POST controlliDeroga + quotazione nel contesto pagina (token dal localStorage + header nodecode)
        const r = await page.evaluate(async (TPL, DBG) => {
          const nodo = '1428'; let token = null;
          const isJwt = v => typeof v === 'string' && /^eyJ[\w-]+\.[\w-]+\./.test(v);
          for (const st of [localStorage, sessionStorage]) { for (let i = 0; i < st.length; i++) { const v = st.getItem(st.key(i)) || ''; try { const j = JSON.parse(v); for (const k in j) if (isJwt(j[k])) { token = j[k]; break; } } catch (e) { if (isJwt(v)) token = v; } if (token) break; } if (token) break; }
          const h = { 'Content-Type': 'application/json', 'nodecode': nodo }; if (token) h['Authorization'] = 'Bearer ' + token;
          const post = async (url, body) => { const r = await fetch(url, { method: 'POST', headers: h, credentials: 'include', body: JSON.stringify(body) }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} return { status: r.status, json: j, len: t.length }; };
          const contr = await post('https://gwm.hdia.it/uefa/quotazione/controlliDeroga', TPL);
          const q = await post('https://gwm.hdia.it/uefa/quotazione', TPL);
          if (q.status !== 200 || !q.json) return { ok: false, error: 'quotazione HDI Casa fallita (status ' + q.status + '/' + contr.status + ')' };
          // parse garanzie {descrizione, lordo, netto, imposte} dalla risposta
          const gar = []; const seen = new Set();
          (function walk(o) { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { if (o.descrizione && (o.lordo != null)) { const k = o.descrizione + '|' + o.lordo; if (!seen.has(k)) { seen.add(k); gar.push({ nome: String(o.descrizione), lordo: o.lordo, netto: o.netto, imposte: o.imposte }); } } for (const v of Object.values(o)) walk(v); } })(q.json);
          const num = v => { if (v == null) return 0; const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : n; };
          const sumBy = k => gar.reduce((s, x) => s + num(x[k]), 0);
          const totale = sumBy('lordo'), netto = sumBy('netto'), imposte = sumBy('imposte');
          // DIAGNOSTICA: cerca nella risposta eventuali campi "premio minimo" (minim*, sconto*, deroga*)
          const diag = [];
          if (DBG) { (function w(o, path) { if (Array.isArray(o)) { o.forEach((x, i) => w(x, path + '[' + i + ']')); } else if (o && typeof o === 'object') { for (const k in o) { const v = o[k]; if (/minim|sconto|deroga|floor|soglia/i.test(k) && (typeof v === 'number' || typeof v === 'string')) diag.push({ campo: path + '.' + k, valore: v }); w(v, path + '.' + k); } } })(q.json, ''); }
          const out = { ok: true, compagnia: 'HDI Assicurazioni', prodotto: 'Globale Casa 2019', premio_totale: totale.toFixed(2).replace('.', ','), premio_totale_num: Math.round(totale * 100) / 100, netto_totale_num: Math.round(netto * 100) / 100, imposte_totale_num: Math.round(imposte * 100) / 100, garanzie: gar, controlli_status: contr.status };
          if (DBG) { out.diagnostica = diag.slice(0, 60); out.top_keys = Object.keys(q.json || {}); }
          return out;
        }, tpl, g('debug') === '1').catch(e => ({ ok: false, error: String(e && e.message || e) }));
        if (r && r.ok && want) r.garanzie_richieste = [...want];
        return r;
      });
      return res.end(JSON.stringify(out, null, 2));
    }
    if (u.pathname.startsWith('/logindump')) {
      const out = await locked(async () => {
        const c = creds();
        await page.goto(c.loginUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
        await page.waitForTimeout(1500);
        await page.screenshot({ path: 'shots/logindump.png', fullPage: true }).catch(() => {});
        return richDump();
      });
      return res.end(JSON.stringify(out, null, 2));
    }
    if (u.pathname.startsWith('/jsgrep')) {
      // Legge i JS applicativi del portale e ritorna le FINESTRE di codice attorno a `q`
      // (funziona anche su file minificati). Per capire come si costruiscono le chiamate.
      const q = u.searchParams.get('q') || '';
      const fileSub = u.searchParams.get('file') || '';
      const before = Math.min(600, parseInt(u.searchParams.get('before') || '160'));
      const after = Math.min(1200, parseInt(u.searchParams.get('after') || '500'));
      const out = await locked(async () => {
        await ensureOnPortal();
        // il JS del preventivatore auto è caricato SOLO su /auto: aprila prima di analizzare
        await page.goto(origin(creds().loginUrl) + '/auto', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
        await page.waitForTimeout(2500);
        return page.evaluate(async ({ q, fileSub, before, after }) => {
          // Salta le librerie: cerca solo nei file APPLICATIVI del portale (index.js,
          // preventivatore_auto.js, custom.js, carrello.js, ajax.js…). `fileSub` (se
          // passato) restringe ulteriormente.
          const skip = /node_modules|\/lib\/|jquery|bootstrap|popper|select2|moment|datatables|raphael|morris|sparkline|sweetalert|tinymce|icheck|mdb\.min|dropzone|dropify|clockpicker|datepicker|timepicker|daterange|switchery|touchspin|tagsinput|multiselect|ascolor|asgradient|sticky|gauge|ion\.range|perfect-scroll|waves|sidebarmenu|validation|jquery-ui/i;
          const urls = [...new Set([...document.querySelectorAll('script[src]')].map(s => s.src)
            .filter(u => /plurima\.net/i.test(u) && !skip.test(u) && (!fileSub || new RegExp(fileSub, 'i').test(u))))];
          const res = [];
          for (const u of urls.slice(0, 10)) {
            try {
              const t = await (await fetch(u)).text();
              const reG = new RegExp(q, 'gi'); let m, n = 0;
              while ((m = reG.exec(t)) && n < 8) { n++; res.push({ file: u.split('/').pop().split('?')[0], at: m.index, snippet: t.slice(Math.max(0, m.index - before), Math.min(t.length, m.index + after)) }); if (reG.lastIndex === m.index) reG.lastIndex++; }
            } catch (e) {}
          }
          return { filesCercati: urls.map(u => u.split('/').pop().split('?')[0]), matches: res.length, windows: res };
        }, { q, fileSub, before, after });
      });
      return res.end(JSON.stringify(out, null, 2));
    }
    if (u.pathname.startsWith('/hubprobe')) {
      // DIAGNOSTICA UNICA: capisce come passare carica_dati_preventivatore senza ping-pong.
      // Ritorna in un colpo: (1) sorgente completo di ajaxPlurima (come firma/serializza),
      // (2) la risposta di carica_dati_preventivatore provata con 5 forme diverse del payload,
      // (3) il "drive" reale (usa le funzioni della pagina) che è la verità di riferimento.
      const targa = (u.searchParams.get('targa') || '').toUpperCase().trim();
      const sitLabel = (u.searchParams.get('situazione') || 'Rinnovo').trim();
      const out = await locked(async () => {
        const result = { targa, sitLabel, ajaxPlurimaSrc: null, varianti: {}, drive: null };
        const gotoAuto = async () => { await page.goto(origin(creds().loginUrl) + '/auto', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}); await page.waitForTimeout(1800); };
        const cap = (v, n = 6000) => { const s = (() => { try { return JSON.stringify(v); } catch { return String(v); } })(); return (s && s.length > n) ? (s.slice(0, n) + '…[' + s.length + ' char]') : v; };
        try { await ensureOnPortal(); await gotoAuto(); } catch (e) {}
        // (1) sorgente ajaxPlurima — fase isolata
        try {
          result.ajaxPlurimaSrc = await page.evaluate(async () => {
            const s = [...document.querySelectorAll('script[src]')].map(x => x.src).find(u => /\/ajax\.js/i.test(u));
            if (!s) return 'ajax.js non trovato';
            const t = await (await fetch(s)).text();
            const i = t.indexOf('function ajaxPlurima');
            return i < 0 ? 'funzione non trovata' : t.slice(i, i + 6800);
          });
        } catch (e) { result.ajaxPlurimaSrc = 'fase fallita: ' + e.message; }
        // (2) varianti dirette del payload — ognuna isolata, ri-navigo se il contesto si rompe
        const db = { targa, situazione_assicurativa: sitLabel, bersani_provenienza: '', targa_provenienza: '' };
        const tries = {
          v1_nested: { dati_base: db },
          v2_jsonstr: { dati_base: JSON.stringify(db) },
          v3_top_targa: { targa, dati_base: db },
          v4_flat: { targa, situazione_assicurativa: sitLabel, bersani_provenienza: '', targa_provenienza: '' },
          v5_nested_jsonstr_top: { targa, dati_base: JSON.stringify(db) },
        };
        result.wire = {};
        sniffStart(); // catturo il body POST REALE di ogni variante
        for (const [name, params] of Object.entries(tries)) {
          try {
            const mark = SNIFF.buf.length;
            const r = await plurimaAjax('carica_dati_preventivatore', params).catch(e => ({ error: e.message }));
            result.varianti[name] = cap(r);
            const newReqs = SNIFF.buf.slice(mark).filter(e => e.kind === 'req' && /carica_dati_preventivatore/.test(e.body || ''));
            result.wire[name] = newReqs.map(e => e.body);
          } catch (e) {
            result.varianti[name] = { error: 'fase fallita: ' + e.message };
            try { await gotoAuto(); } catch (e2) {} // il contesto potrebbe essersi rotto: ripristino
          }
        }
        sniffStop();
        // (2b) come jQuery serializza DAVVERO il payload annidato (la chiave del problema)
        try {
          result.serialize = await page.evaluate(({ targa, sitLabel }) => {
            if (!window.jQuery) return { error: 'jQuery non presente' };
            const db = { targa, situazione_assicurativa: sitLabel, bersani_provenienza: '', targa_provenienza: '' };
            const data = { a: 'carica_dati_preventivatore', dati_base: db };
            return {
              traditional_global: !!jQuery.ajaxSettings.traditional,
              param_default: jQuery.param(data),
              param_traditional: jQuery.param(data, true),
            };
          }, { targa, sitLabel });
        } catch (e) { result.serialize = { error: e.message }; }
        // (3) DRIVE reale + SNIFF: catturo il POST REALE che la pagina manda (verità sul filo).
        //     Il listener page.on('request') registra il body prima che l'eventuale navigazione rompa il contesto.
        try {
          await gotoAuto();
          sniffStart();
          // Simulo l'INPUT REALE: scrivo la targa e scateno i veri handler (input/change/blur/keyup),
          // attendo che compaia il select situazione, lo seleziono (la pagina richiama carica da sola).
          result.drive = await page.evaluate(async ({ targa, sitLabel }) => {
            const log = [];
            try {
              if (typeof ajaxPlurima !== 'function') return { error: 'ajaxPlurima assente' };
              const base = (typeof path_new !== 'undefined' ? path_new : '') + '/a__php/__ajax.php';
              const call = (data) => new Promise((res) => {
                let done = false; const fin = v => { if (!done) { done = true; res(v); } };
                try { ajaxPlurima({ url: base, data, type: 'POST', cache: false, success: d => fin(d), error: x => fin({ error: 'http ' + (x && x.status) }) }); }
                catch (e) { fin({ error: e.message }); }
                setTimeout(() => fin({ error: 'timeout' }), 28000);
              });
              // 1) recupera_situazione_assicurativa (registra il contesto targa lato server)
              const r1 = await call({ a: 'recupera_situazione_assicurativa', targa });
              log.push('recupera: ' + (r1 && r1.error ? 'ERR ' + r1.error : 'ok, tipo_veicolo=' + (r1 && r1.data && r1.data.tipo_veicolo)));
              // 2) SUBITO carica_dati_preventivatore con dati_base, STESSO contesto, zero navigazione
              const db = { targa, situazione_assicurativa: sitLabel, bersani_provenienza: '', targa_provenienza: '' };
              const r2 = await call({ a: 'carica_dati_preventivatore', dati_base: db });
              const r2s = (() => { try { return JSON.stringify(r2); } catch { return String(r2); } })();
              return {
                log,
                recupera_ok: !!(r1 && !r1.error),
                carica: r2s && r2s.length > 6000 ? (r2s.slice(0, 6000) + '…[' + r2s.length + ' char]') : r2,
              };
            } catch (e) { return { error: e.message, log }; }
          }, { targa, sitLabel });
        } catch (e) { result.drive = { error: 'fase fallita (navigazione?): ' + e.message }; }
        // SEQUENZA COMPLETA delle chiamate reali (in ordine): è la ricetta da replicare.
        try {
          const buf = sniffStop();
          result.sniff_sequenza = buf.filter(e => /__ajax\.php/.test(e.url || ''))
            .map(e => e.kind === 'req'
              ? { '→req': (String(e.body || '').match(/a=([a-z_]+)/) || [, '?'])[1], body: String(e.body || '').slice(0, 500) }
              : { '←res': e.status, body: String(e.body || '').slice(0, 800) });
        } catch (e) { result.sniff_sequenza = { error: e.message }; }
        return result;
      });
      return res.end(JSON.stringify(out, null, 2));
    }
    if (u.pathname.startsWith('/premio')) {
      // PREMIO HDI (produzione): targa + data nascita → premio annuale da Giada/UEFA (auto e moto).
      const targa = (u.searchParams.get('targa') || '').toUpperCase().trim();
      const nascita = (u.searchParams.get('nascita') || '').trim();
      if (!targa) return res.end(JSON.stringify({ ok: false, error: 'targa mancante' }));
      const out = await locked(() => driveHDIQuote(targa, nascita));
      return res.end(JSON.stringify(out, null, 2));
    }
    if (u.pathname.startsWith('/hubpremio')) {
      // ESPLORAZIONE PREMIO: pilota il wizard OLTRE lo step Veicolo, avanzando con "Successivo"
      // fino allo step Preventivo (dove Plurima chiama calcola_preventivo come job). Logga gli step
      // attraversati, eventuali blocchi di validazione e cattura le chiamate calcola_preventivo/get_job.
      const targa = (u.searchParams.get('targa') || '').toUpperCase().trim();
      const sitLabel = (u.searchParams.get('situazione') || 'Rinnovo').trim();
      const maxNext = Math.min(8, parseInt(u.searchParams.get('next') || '4', 10) || 4);
      if (!targa) return res.end(JSON.stringify({ ok: false, error: 'targa mancante' }));
      const out = await locked(async () => {
        await ensureOnPortal();
        await page.goto(origin(creds().loginUrl) + '/auto', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
        await page.waitForTimeout(2200);
        sniffStart();
        const drive = await page.evaluate(async ({ targa, sitLabel, maxNext }) => {
          const log = []; const $ = window.jQuery; const sleep = ms => new Promise(r => setTimeout(r, ms));
          const stepAttivo = () => { const a = document.querySelector('#steps_preventivatore .current a, .wizard .current a, .steps .current a'); return a ? (a.textContent || '').trim() : '?'; };
          const popup = () => { const p = document.querySelector('.swal2-popup, .sweet-alert, .swal-modal'); return p ? (p.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200) : null; };
          const chiudiPopup = () => { const b = document.querySelector('.swal2-confirm, .sweet-alert .confirm, .swal-button--confirm'); if (b) b.click(); };
          try {
            if (!$) return { error: 'jQuery assente' };
            const t = $('#targa'); if (!t.length) return { error: '#targa assente' };
            t.val(targa).trigger('input').trigger('keyup').trigger('change').trigger('blur');
            for (let i = 0; i < 30 && !$('#situazione_assicurativa').length; i++) await sleep(500);
            if (!$('#situazione_assicurativa').length) return { error: 'situazione non caricata' };
            $('#situazione_assicurativa').val(sitLabel).trigger('change');
            await sleep(1200);
            log.push('step iniziale: ' + stepAttivo());
            // avanzo ripetutamente con "Successivo", loggando step/popup ad ogni passo
            for (let k = 0; k < maxNext; k++) {
              // se sono allo step Veicolo, seleziono l'allestimento (serve il valore assicurato per il premio)
              if (/veicolo/i.test(stepAttivo())) {
                let as = null;
                for (let w = 0; w < 18; w++) { as = document.querySelector('select[id*=allestimento i], select[name*=allestimento i]'); if (as && [...as.options].some(o => o.value)) break; await sleep(500); }
                if (as && !as.value) {
                  const opt = [...as.options].find(o => o.value);
                  if (opt) { $(as).val(opt.value).trigger('change'); log.push('allestimento selezionato: ' + (opt.textContent || '').trim().slice(0, 40)); await sleep(3000); }
                  else log.push('allestimento: select presente ma senza opzioni');
                } else log.push('allestimento: ' + (as ? ('opts=' + as.options.length + ' val=' + as.value) : 'select ASSENTE'));
              }
              const nextA = document.querySelector('a[href="#next"], .actions a[href="#next"], a[href$="next"]');
              if (!nextA) { log.push('next ' + k + ': link assente'); break; }
              nextA.click();
              await sleep(3500);
              const pp = popup();
              log.push('dopo next ' + (k + 1) + ': step=' + stepAttivo() + (pp ? ' | POPUP: ' + pp : ''));
              if (pp) { chiudiPopup(); await sleep(800); }
            }
            // FORZO un ricalcolo: tocco il massimale RC (change) per far ripartire calcola_preventivo
            // con la configurazione completa, poi attendo a lungo che il job arrivi a status 2.
            try {
              const mr = document.getElementById('massimale_rc');
              if (mr && window.jQuery) { jQuery(mr).trigger('change'); }
            } catch (e) {}
            await sleep(20000); // i job calcola_preventivo (con polling get_job) impiegano ~10-18s
            // candidate globali del premio
            const cand = ['dati_preventivo', 'preventivo', 'premio', 'dati_premio', 'risultato_preventivo', 'preventivi', 'jsonArrProdotto'];
            const globs = {};
            for (const g of cand) { try { if (typeof window[g] !== 'undefined' && window[g]) { const s = JSON.stringify(window[g]); globs[g] = s.length > 2500 ? s.slice(0, 2500) + '…[' + s.length + ']' : window[g]; } } catch (e) {} }
            // STRUTTURA visibile della pagina allo step Preventivo: premio a video, controlli, bottoni
            const vis = e => e && e.offsetParent !== null;
            const txt = (document.body.innerText || '').replace(/[ \t]+/g, ' ');
            const premioVisibile = (txt.match(/(?:€\s*[\d.][\d.,]*|[\d.][\d.,]*\s*€)/g) || []).slice(0, 14);
            const controlli = [...document.querySelectorAll('select, input[type=checkbox], input[type=radio]')].filter(vis).slice(0, 50).map(e => ({
              tag: e.tagName, type: e.type || '', id: (e.id || '').slice(0, 30), name: (e.name || '').slice(0, 30), checked: (e.type === 'checkbox' || e.type === 'radio') ? e.checked : undefined,
              val: (e.value || '').slice(0, 20), opts: e.tagName === 'SELECT' ? [...e.options].slice(0, 6).map(o => (o.textContent || '').trim().slice(0, 24)) : undefined,
              label: ((e.closest('label,.form-group,.aw-field,td,div') || {}).innerText || '').replace(/\s+/g, ' ').trim().slice(0, 45),
            }));
            const bottoni = [...document.querySelectorAll('a,button')].filter(e => vis(e) && (e.textContent || '').trim() && /calcola|quota|preventiv|ricalcola|aggiorna|conferma|emetti|salva/i.test((e.textContent || '') + (e.getAttribute('onclick') || '') + (e.id || ''))).slice(0, 20).map(e => ({ t: (e.textContent || '').trim().slice(0, 30), id: (e.id || '').slice(0, 30), onclick: (e.getAttribute('onclick') || '').slice(0, 50) }));
            const allestSel = document.querySelector('select[id*=allestimento i], select[name*=allestimento i]');
            const allestimenti = allestSel ? { val: allestSel.value, opts: [...allestSel.options].map(o => ({ v: o.value, t: (o.textContent || '').trim().slice(0, 45) })) } : null;
            // ATTIVAZIONE GARANZIE: cerco toggle/switch/checkbox/card vicino ai select garanzia.
            // (1) elementi con id/class/onclick che parlano di garanzia/attiva/switch/toggle
            const attivatori = [...document.querySelectorAll('input,a,button,div,span,label,i')].filter(e => vis(e) && /garanzia|attiva|disattiva|switch|toggle|aggiungi|seleziona_garanzia/i.test((e.id || '') + ' ' + (e.className || '') + ' ' + (e.getAttribute('onclick') || ''))).slice(0, 30).map(e => ({ tag: e.tagName, id: (e.id || '').slice(0, 35), cls: (e.className || '').slice(0, 45), onclick: (e.getAttribute('onclick') || '').slice(0, 60), txt: (e.textContent || '').trim().slice(0, 25), checked: e.type === 'checkbox' ? e.checked : undefined }));
            // (2) HTML attorno al select scoperto_franchigia_furto (per vedere com'è strutturata una garanzia)
            const furto = document.getElementById('scoperto_franchigia_furto');
            const garanziaHtml = furto ? (furto.closest('.card, .panel, .box, .garanzia, .row, .col, fieldset, .form-group, tr, li') || furto.parentElement || {}).outerHTML : null;
            // LISTA COMPLETA garanzie: tutti i div con id "garanzia_*", con stato attivo/inattivo
            const tutte_garanzie = [...document.querySelectorAll('[id^="garanzia_"]')].map(e => ({ key: e.id.replace(/^garanzia_/, ''), attiva: /selezionata/.test(e.className), titolo: ((e.querySelector('.div_titolo_garanzia') || {}).textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) }));
            const haSelezionaGaranzia = typeof window.selezionaGaranzia === 'function';
            // SCONTO RCA: tutto ciò che riguarda lo sconto (input nascosti, widget slider, bottone APPLICA)
            const scontoEls = [...document.querySelectorAll('input,a,button,div,span')].filter(e => vis(e) && /sconto/i.test((e.id || '') + ' ' + (e.className || '') + ' ' + (e.name || '') + ' ' + (e.getAttribute('onclick') || ''))).slice(0, 25).map(e => ({ tag: e.tagName, id: (e.id || '').slice(0, 35), cls: (e.className || '').slice(0, 45), name: (e.name || '').slice(0, 30), onclick: (e.getAttribute('onclick') || '').slice(0, 70), val: (e.value || '').slice(0, 20), txt: (e.textContent || '').trim().slice(0, 25) }));
            const applicaBtn = [...document.querySelectorAll('a,button')].find(b => /applica\s*sconto/i.test(b.textContent || ''));
            const scontoPanelHtml = applicaBtn ? ((applicaBtn.closest('.card, .panel, .box, .col, div') || {}).outerHTML || '').replace(/\s+/g, ' ').slice(0, 2500) : null;
            const fnSconto = ['applicaSconto', 'applica_sconto', 'setSconto', 'cambiaSconto'].filter(f => typeof window[f] === 'function');
            return { log, step_finale: stepAttivo(), globali_premio: globs, premioVisibile, controlli, bottoni, allestimenti, attivatori, garanziaHtml: garanziaHtml ? garanziaHtml.replace(/\s+/g, ' ').slice(0, 2500) : null, tutte_garanzie, haSelezionaGaranzia, scontoEls, scontoPanelHtml, fnSconto };
          } catch (e) { return { error: e.message, log }; }
        }, { targa, sitLabel, maxNext });
        const buf = sniffStop();
        const seq = buf.filter(e => /__ajax\.php/.test(e.url || '')).map(e => e.kind === 'req'
          ? { req: (String(e.body || '').match(/a=([a-z_]+)/) || [, '?'])[1], body: String(e.body || '').slice(0, 400) }
          : { res: e.status, body: String(e.body || '').slice(0, 1800) });
        // ESTRAGGO il risultato COMPLETO del job calcola_preventivo (get_job con status "2").
        let premio = null;
        try {
          const jobs = buf.filter(e => e.kind === 'res' && /"jobid"/.test(e.body || ''))
            .map(e => { try { return JSON.parse(e.body); } catch { return null; } }).filter(Boolean);
          // tutti i job completati (status 2); se uno ha premio>0 lo preferisco
          const completati = jobs.filter(j => String(j.status) === '2' && j.result && j.result.data);
          const mapProd = data => (data.message || []).map(p => ({
            compagnia: p.idcompagnia, fornitore: p.idfornitore, tariffa: p.idtariffa, prodotto: p.nomeprodotto,
            result: p.result, premio_annuale: p.premio_annuale, premio_rata: p.premio_rata, frazionamento: p.frazionamento,
            premio_imponibile: p.premio_imponibile, sconto_tariffa: p.sconto_tariffa, sconto_quotazione: p.sconto_quotazione,
            data_effetto: p.data_effetto, data_scadenza: p.data_scadenza,
            garanzie: (p.garanzie || []).map(g => ({ nome: g.nome, valore: g.valore, premio: g.premio })),
            campi: (p.campi || []).map(c => ({ key: c.key, n_values: (c.values || []).length, label: (c.values && c.values[0] && (c.values[0].nome_campo || c.values[0].label_campo)) || '' })),
          }));
          const conPremio = completati.find(j => (j.result.data.message || []).some(p => Number(p.premio_annuale) > 0));
          const scelto = conPremio || completati[completati.length - 1];
          if (scelto) {
            premio = { jobs_completati: completati.length, product: scelto.result.data.product, result: scelto.result.data.result, prodotti: mapProd(scelto.result.data) };
          } else {
            premio = { jobs_completati: completati.length, jobs_status: jobs.map(j => j.status), nota: 'nessun job con status 2 con data' };
          }
        } catch (e) { premio = { error: e.message }; }
        return { targa, sitLabel, drive, premio, sniff_sequenza: seq };
      });
      return res.end(JSON.stringify(out, null, 2));
    }
    if (u.pathname.startsWith('/hubveicolo')) {
      // DATI VEICOLO da Plurima pilotando il WIZARD VERO fino allo step 2: si scrive la targa,
      // si sceglie la situazione e si clicca "Successivo" (a[href="#next"]). La pagina esegue il
      // suo flusso reale e carica_dati_preventivatore popola `dati_preventivatore` col veicolo.
      const targa = (u.searchParams.get('targa') || '').toUpperCase().trim();
      const sitLabel = (u.searchParams.get('situazione') || 'Rinnovo').trim();
      const debug = u.searchParams.get('debug') === '1';
      const bersaniTarga = (u.searchParams.get('bersani') || u.searchParams.get('bersaniTarga') || '').toUpperCase().trim();
      if (!targa) return res.end(JSON.stringify({ ok: false, error: 'targa mancante' }));
      const out = await locked(() => driveVeicolo(targa, sitLabel, { debug, bersaniTarga }));
      return res.end(JSON.stringify(out, null, 2));
    }
    if (u.pathname.startsWith('/hub')) {
      // HUB Italiana: da targa (+ codice fiscale) recupera veicolo/prodotto e anagrafica
      // cliente, con chiamate dirette firmate. È la base da salvare in Clienti QUOTO.
      const targa = (u.searchParams.get('targa') || '').toUpperCase().trim();
      const cf = (u.searchParams.get('cf') || u.searchParams.get('cf_piva') || '').toUpperCase().trim();
      const sit = (u.searchParams.get('situazione') || '1').trim(); // 1=Rinnovo, 2=Voltura al PRA
      const out = await locked(async () => {
        const r = { targa, cf, situazione: null, veicolo: null, anagrafica: null };
        if (targa) {
          // Situazione assicurativa = tipo veicolo, tipo proprietario, prodotto (codice_prodotto/id_tariffa).
          // NB: i dati veicolo dettagliati (marca/modello) via carica_dati_preventivatore richiedono lo stato
          // del wizard lato server e verranno collegati a parte; qui restiamo su ciò che è affidabile.
          r.situazione = await plurimaAjax('recupera_situazione_assicurativa', { targa }).catch(e => ({ error: e.message }));
        }
        if (cf) r.anagrafica = await plurimaAjax('cerca_anagrafica', { cf_piva: cf, filtro: 1 }).catch(e => ({ error: e.message }));
        return r;
      });
      return res.end(JSON.stringify(out, null, 2));
    }
    if (u.pathname.startsWith('/api')) {
      // Chiamante generico delle azioni interne del portale (in-page, firmato).
      // /api?action=<azione>&param1=..&param2=..  → ritorna il JSON della risposta.
      const action = u.searchParams.get('action') || u.searchParams.get('a');
      if (!action) return res.end(JSON.stringify({ error: 'manca action' }));
      const params = {}; for (const [k, v] of u.searchParams) if (k !== 'action' && k !== 'a') params[k] = v;
      const out = await locked(() => plurimaAjax(action, params).catch(e => ({ error: e.message })));
      return res.end(JSON.stringify({ action, params, risposta: out }, null, 2));
    }
    if (u.pathname.startsWith('/explore')) {
      // STRUMENTO GENERICO (vale per ogni compagnia): naviga il portale passo-passo e
      // ritorna la STRUTTURA REALE della pagina (menu/link, campi, bottoni) + le chiamate
      // __ajax.php scatenate dall'azione. Parametri:
      //   goto=<path>      → vai a una pagina (relativa al portale o assoluta)
      //   click=<testo>    → clicca l'elemento (link/voce di menu/bottone) con quel testo
      //   fill=<valore>    → scrive un valore nel campo (targa se c'è, altrimenti primo testo)
      //   enter=1          → preme Invio dopo il fill (spesso lancia la ricerca)
      //   sniff=1          → registra le chiamate API durante l'azione
      const g = k => u.searchParams.get(k) || '';
      const out = await locked(async () => {
        const base = origin(creds().loginUrl);
        const doSniff = g('sniff') === '1';
        if (doSniff) sniffStart();
        const did = {};
        if (g('goto')) {
          let p = g('goto'); if (!/^https?:/i.test(p)) p = base + (p.startsWith('/') ? p : '/' + p);
          await page.goto(p, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
          await page.waitForTimeout(2500); did.goto = p;
          if (isLoginUrl(page.url()) || await hasPasswordField()) { await ensureLogin(); await page.goto(p, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}); await page.waitForTimeout(2000); }
        }
        if (g('click')) { did.click = g('click'); did.clicked = await clickByText(g('click')); await page.waitForTimeout(2500); }
        if (g('fill')) {
          did.fill = g('fill');
          did.filled = await page.evaluate((val) => {
            const vis = e => e && e.offsetParent !== null;
            const near = e => (e.placeholder || '') + ' ' + (e.name || '') + ' ' + (e.id || '') + ' ' + ((e.closest('div,label,form') || {}).innerText || '');
            const inputs = [...document.querySelectorAll('input[type=text],input:not([type]),input[type=search]')].filter(vis);
            const inp = inputs.find(e => /targa/i.test(near(e))) || inputs[0];
            if (!inp) return false;
            inp.focus(); inp.value = val; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); inp.dispatchEvent(new Event('keyup', { bubbles: true }));
            // molti lookup (es. targa) scattano su change/blur via jQuery
            if (window.jQuery) { try { window.jQuery(inp).trigger('change').trigger('blur').trigger('keyup'); } catch (e) {} }
            inp.dispatchEvent(new Event('blur', { bubbles: true }));
            window.__expInput = inp; return true;
          }, g('fill'));
          await page.waitForTimeout(400);
          if (g('enter') === '1') { await page.evaluate(() => { const i = window.__expInput; if (i) i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, bubbles: true })); }).catch(() => {}); await page.keyboard.press('Enter').catch(() => {}); }
          await page.waitForTimeout(3000); // attende l'eventuale lookup (popola i campi successivi)
        }
        if (g('select')) {
          did.select = g('select');
          did.selected = await page.evaluate((val) => {
            const re = new RegExp(val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            for (const s of document.querySelectorAll('select')) {
              const vis = s.offsetParent !== null || s.classList.contains('select2-hidden-accessible'); // i select2 sono nascosti
              if (!vis) continue;
              const opt = [...s.options].find(o => re.test(o.textContent || ''));
              if (opt) {
                s.value = opt.value;
                // select2/jQuery: il change va emesso via jQuery, altrimenti la UI non si aggiorna e la validazione vede vuoto
                if (window.jQuery) { try { window.jQuery(s).val(opt.value).trigger('change'); } catch (e) {} }
                else { s.dispatchEvent(new Event('change', { bubbles: true })); }
                return true;
              }
            }
            return false;
          }, g('select'));
          await page.waitForTimeout(2800);
        }
        if (g('cf')) {
          // Codice fiscale del proprietario (compare dopo la situazione): fa scattare l'attestato di rischio
          did.cf = g('cf');
          did.cfFilled = await page.evaluate((cf) => {
            const vis = e => e && e.offsetParent !== null;
            const i = document.querySelector('#codice_fiscale_proprietario')
              || [...document.querySelectorAll('input')].find(e => vis(e) && /codice_fiscale|cf_prop|proprietario/i.test((e.id || '') + (e.name || '')));
            if (!i) return false;
            i.focus(); i.value = cf; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); i.dispatchEvent(new Event('keyup', { bubbles: true }));
            if (window.jQuery) { try { window.jQuery(i).trigger('change').trigger('blur').trigger('keyup'); } catch (e) {} }
            i.dispatchEvent(new Event('blur', { bubbles: true }));
            return true;
          }, g('cf').toUpperCase());
          await page.waitForTimeout(4000); // attende l'attestato di rischio
        }
        if (g('then')) { did.then = g('then'); did.thenClicked = await clickByText(g('then')); await page.waitForTimeout(4000); }
        // grepjs=1: estrae TUTTI i nomi azione (a=...) dai file JS applicativi del portale → mappa completa in un colpo
        if (g('grepjs') === '1') {
          const found = await page.evaluate(async () => {
            const skip = /node_modules|\/lib\/|jquery|bootstrap|popper|select2|moment|datatables|raphael|morris|sparkline|sweetalert|tinymce|icheck|mdb\.min|dropzone|dropify|clockpicker|datepicker|timepicker|daterange|switchery|touchspin|tagsinput|multiselect|ascolor|asgradient|sticky|toast|gauge|ion\.range|perfect-scroll|waves|sidebarmenu|validation|jquery-ui/i;
            const urls = [...new Set([...document.querySelectorAll('script[src]')].map(s => s.src).filter(u => /plurima\.net/i.test(u) && !skip.test(u)))];
            const actions = new Set();
            const files = [];
            for (const u of urls.slice(0, 20)) {
              try {
                const t = await (await fetch(u)).text(); files.push(u.split('/').pop());
                let m; const re = /["']?\ba\b["']?\s*[:=]\s*["']([a-z0-9_]{3,45})["']/gi;
                while ((m = re.exec(t))) actions.add(m[1]);
                const re2 = /[?&]a=([a-z0-9_]{3,45})/gi; while ((m = re2.exec(t))) actions.add(m[1]);
                const re3 = /a=([a-z0-9_]{3,45})/gi; while ((m = re3.exec(t))) actions.add(m[1]);
              } catch (e) {}
            }
            return { files, actions: [...actions].sort() };
          }).catch(e => ({ error: e.message }));
          const captured0 = tidyCaptured(doSniff ? sniffStop() : []);
          return { url: page.url(), did, grepjs: found, captured: captured0 };
        }
        await page.waitForTimeout(doSniff ? 4500 : 400);
        const captured = tidyCaptured(doSniff ? sniffStop() : []);
        // Mappa pagina: link/menu (anche voci non-<a>), campi e bottoni
        const map = await page.evaluate(() => {
          const norm = s => (s || '').replace(/\s+/g, ' ').trim();
          const vis = e => e && e.offsetParent !== null;
          const menu = [];
          document.querySelectorAll('a,[onclick],[role=menuitem],li>span,button').forEach(e => {
            if (!vis(e)) return; const t = norm(e.innerText); if (!t || t.length > 45) return;
            const href = e.getAttribute('href') || ''; const oc = e.getAttribute('onclick') || '';
            menu.push(t + (href ? '  →  ' + href : (oc ? '  →  onclick:' + oc.slice(0, 60) : '')));
          });
          const fields = [...document.querySelectorAll('input,select,textarea')].filter(vis).map(e => ({
            tag: e.tagName.toLowerCase(), type: e.getAttribute('type') || null, id: e.id || null, name: e.getAttribute('name') || null,
            placeholder: e.getAttribute('placeholder') || null, label: norm((e.closest('div,label,td,th') || {}).innerText).slice(0, 50),
          }));
          return { title: document.title, menu: [...new Set(menu)].slice(0, 120), fields: fields.slice(0, 80) };
        });
        return { url: page.url(), did, ...map, captured };
      });
      return res.end(JSON.stringify(out, null, 2));
    }
    if (u.pathname.startsWith('/motoprobe')) {
      // DISCOVERY MOTO: nel preventivatore GENERICO (/preventivazione) il prodotto si sceglie
      // dal select2 #id_prodotto (ricerca ajax). Apro il select2, digito `q` (default "moto") e
      // ritorno le opzioni trovate (testo + id) e le chiamate ajax scatenate → così individuo
      // l'id del prodotto Moto/Ciclomotori da pilotare poi come per l'Auto.
      const q = u.searchParams.get('q') || 'moto';
      const out = await locked(async () => {
        await ensureOnPortal();
        await page.goto(origin(creds().loginUrl) + '/preventivazione', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
        await page.waitForTimeout(3000);
        sniffStart();
        const r = await page.evaluate(async (q) => {
          const sleep = ms => new Promise(r => setTimeout(r, ms));
          const $ = window.jQuery; const out = { steps: [] };
          const sel = document.querySelector('#id_prodotto');
          if (!sel) return { error: '#id_prodotto assente' };
          out.dataset = Object.assign({}, sel.dataset);
          const hasS2 = !!($ && $(sel).hasClass('select2-hidden-accessible'));
          out.select2 = hasS2;
          if (hasS2) {
            try { $(sel).select2('open'); } catch (e) { out.steps.push('open err: ' + e.message); }
            await sleep(600);
            const sf = document.querySelector('.select2-search__field, input.select2-search__field');
            if (sf) { sf.value = q; sf.dispatchEvent(new Event('input', { bubbles: true })); sf.dispatchEvent(new KeyboardEvent('keyup', { key: 'o', bubbles: true })); out.steps.push('digitato "' + q + '"'); }
            else out.steps.push('campo ricerca select2 assente');
            await sleep(4000);
            out.options = [...document.querySelectorAll('.select2-results__option')].map(o => ({ txt: (o.textContent || '').trim().slice(0, 70), id: o.id || null, sel: o.getAttribute('aria-selected') }));
          } else {
            out.steps.push('select nativo (no select2)');
            out.options = [...sel.options].map(o => ({ v: o.value, t: (o.textContent || '').trim().slice(0, 70) }));
          }
          return out;
        }, q);
        const cap = sniffStop();
        return { r, captured: tidyCaptured(cap) };
      });
      return res.end(JSON.stringify(out, null, 2));
    }
    if (u.pathname.startsWith('/anagprobe')) {
      // DISCOVERY VOLTURA: pilota il wizard /auto fino allo step Anagrafiche (in Voltura il
      // contraente NON arriva dall'attestato e va compilato) e ritorna l'elenco esatto dei campi
      // (id/name/label) + le opzioni di bersani_provenienza → per scrivere il filler preciso.
      const targa = (u.searchParams.get('targa') || '').toUpperCase().trim();
      const sit = u.searchParams.get('situazione') || 'Voltura al PRA';
      const out = await locked(async () => {
        await ensureOnPortal();
        await page.goto(origin(creds().loginUrl) + '/auto', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
        await page.waitForTimeout(2500);
        return page.evaluate(async ({ targa, sit }) => {
          const $ = window.jQuery; const sleep = ms => new Promise(r => setTimeout(r, ms)); const log = [];
          const stepAttivo = () => { const a = document.querySelector('#steps_preventivatore .current a, .wizard .current a, .steps .current a'); return a ? (a.textContent || '').trim() : '?'; };
          const popup = () => { const p = document.querySelector('.swal2-popup, .sweet-alert, .swal-modal'); return p ? (p.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160) : null; };
          const chiudi = () => { const b = document.querySelector('.swal2-confirm, .sweet-alert .confirm, .swal-button--confirm'); if (b) b.click(); };
          const vis = e => e && e.offsetParent !== null;
          if (!$) return { error: 'jQuery assente' };
          $('#targa').val(targa).trigger('input').trigger('keyup').trigger('change').trigger('blur');
          for (let i = 0; i < 30 && !$('#situazione_assicurativa').length; i++) await sleep(500);
          if (!$('#situazione_assicurativa').length) return { error: 'situazione non caricata' };
          $('#situazione_assicurativa').val(sit).trigger('change'); await sleep(1500);
          log.push('step dopo situazione: ' + stepAttivo());
          const bp = document.getElementById('bersani_provenienza');
          log.push('bersani_provenienza: ' + (bp ? [...bp.options].map(o => (o.textContent || '').trim().slice(0, 30) + '=' + o.value).join(' | ') : 'assente'));
          for (let k = 0; k < 4 && !/anagra/i.test(stepAttivo()); k++) {
            const n = document.querySelector('a[href="#next"], .actions a[href="#next"]'); if (!n) { log.push('next assente a ' + stepAttivo()); break; }
            n.click(); await sleep(3500);
            const pp = popup(); if (pp) { log.push('popup: ' + pp); chiudi(); await sleep(800); }
          }
          log.push('step finale: ' + stepAttivo());
          const campi = [...document.querySelectorAll('input,select,textarea')].filter(vis).map(e => ({ tag: e.tagName, type: e.type || '', id: (e.id || '').slice(0, 45), name: (e.name || '').slice(0, 40), ph: (e.placeholder || '').slice(0, 30), label: ((e.closest('label,.form-group,.col,div,td') || {}).innerText || '').replace(/\s+/g, ' ').trim().slice(0, 45) }));
          return { log, step: stepAttivo(), campi };
        }, { targa, sit });
      });
      return res.end(JSON.stringify(out, null, 2));
    }
    if (u.pathname.startsWith('/sniff/start')) {
      // Cattura MANUALE: accende la registrazione e ritorna subito. L'operatore fa il
      // preventivo a mano (via VNC) e poi chiama /sniff/stop. Così catturiamo le azioni
      // REALI (__ajax.php?a=...) senza dipendere dall'automazione.
      sniffStart();
      return res.end(JSON.stringify({ ok: true, recording: true, msg: 'Cattura avviata. Fai il preventivo a mano nel browser del server (VNC), poi chiama /sniff/stop.' }));
    }
    if (u.pathname.startsWith('/sniff/stop')) {
      const buf = sniffStop();
      // Tiene solo le chiamate del portale Plurima (le API interne) per ridurre il rumore.
      const plurima = buf.filter(e => /plurima\.net|italnext/i.test(e.url || ''));
      return res.end(JSON.stringify({ ok: true, recording: false, captured: buf.length, plurimaCalls: plurima.length, summary: sniffSummary(plurima.length ? plurima : buf), calls: plurima.length ? plurima : buf }, null, 2));
    }
    if (u.pathname.startsWith('/sniff')) {
      // Investigazione API nascoste: esegue il flusso preventivo con la cattura di
      // rete attiva e ritorna le chiamate XHR/fetch interne (lookup targa, calcolo
      // premio/tariffe). full=1 → flusso completo (4 step); altrimenti solo step1.
      const g = k => u.searchParams.get(k) || '';
      const full = g('full') === '1' || g('full') === 'true';
      const out = await locked(async () => {
        sniffStart();
        let flow = null, err = null;
        try {
          if (full) {
            flow = await autoPreventivo({
              targa: g('targa').toUpperCase().trim(), situazione: g('situazione') || 'Rinnovo',
              attestato: g('attestato'), bersani: g('bersani'), tipoGuida: g('tipoGuida'),
              frazionamento: g('frazionamento'), massimale: g('massimale'),
              dataUltimaVoltura: g('dataUltimaVoltura'), indirizzo: g('indirizzo'), salva: false,
            });
          } else {
            flow = await autoStep1({ targa: g('targa').toUpperCase().trim(), situazione: g('situazione') || 'Rinnovo', attestato: g('attestato') });
          }
        } catch (e) { err = e.message; }
        const buf = sniffStop();
        return { ok: !err, error: err, full, captured: buf.length, summary: sniffSummary(buf), calls: buf, flow: flow ? { url: flow.url, steps: flow.steps || flow.trace, premio: flow.premio || null } : null };
      });
      return res.end(JSON.stringify(out, null, 2));
    }
    if (u.pathname.startsWith('/preventivo')) { // preventivo auto COMPLETO (4 step) → premio
      const g = k => u.searchParams.get(k) || '';
      const out = await locked(() => autoPreventivo({
        targa: g('targa').toUpperCase().trim(), situazione: g('situazione'), attestato: g('attestato'),
        bersani: g('bersani'), tipoGuida: g('tipoGuida'), frazionamento: g('frazionamento'),
        massimale: g('massimale'), dataUltimaVoltura: g('dataUltimaVoltura'), indirizzo: g('indirizzo'),
        salva: g('salva') === '1' || g('salva') === 'true',
      }).catch(e => ({ error: e.message })));
      return res.end(JSON.stringify(out, null, 2));
    }
    if (u.pathname.startsWith('/auto')) { // solo step 1 + mappa pagina (per tarare)
      const out = await locked(() => autoStep1({
        targa: (u.searchParams.get('targa') || '').toUpperCase().trim(),
        situazione: u.searchParams.get('situazione') || '',
        attestato: u.searchParams.get('attestato') || '',
      }).catch(e => ({ error: e.message })));
      return res.end(JSON.stringify(out, null, 2));
    }
    if (u.pathname.startsWith('/shot')) { await page.screenshot({ path: 'shots/current.png', fullPage: true }).catch(() => {}); return res.end(JSON.stringify({ ok: true, url: page.url() })); }
    res.end(JSON.stringify({ endpoints: ['/status', '/login', '/logindump', '/auto?targa=..&situazione=..', '/preventivo?targa=..', '/sniff?targa=..&full=1', '/shot'] }));
  } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e) })); }
}).listen(4400, '127.0.0.1', () => log('Telecomando HTTP HDI su 127.0.0.1:4400'));

async function keepAlive() {
  await locked(async () => {
    try {
      await ensurePage(); // CHIAVE: se la pagina è morta/chiusa la ricrea PRIMA di navigare,
      //                      altrimenti page.goto lanciava 'Target page closed' e il keep-alive restava rotto per sempre.
      const c = creds();
      await page.goto(origin(c.loginUrl), { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.mouse.move(150 + Math.random() * 500, 150 + Math.random() * 350).catch(() => {});
      await page.evaluate(() => { window.scrollBy(0, 120); setTimeout(() => window.scrollTo(0, 0), 300); }).catch(() => {});
      await page.waitForTimeout(500);
      if (isLoginUrl(page.url()) || await hasPasswordField() || await isPublicLanding()) {
        log('[keep-alive] sessione caduta → ri-login...');
        await autoLogin().catch(() => false);
      }
    } catch (e) { log('[keep-alive] err:', e.message); }
  });
}
setInterval(keepAlive, 3 * 60 * 1000);
log('=== SERVIZIO ITALIANA ATTIVO (login generico) ===');
await new Promise(() => {});
