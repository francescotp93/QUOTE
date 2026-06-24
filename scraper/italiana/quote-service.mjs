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
const FONTE_ID = process.env.FONTE_ID || 'c-italiana';
const DEFAULT_LOGIN = 'https://portale.plurima.net/login.php';
const log = (...a) => console.log(new Date().toLocaleTimeString('it-IT'), '[italiana]', ...a);

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
const origin = (u) => { try { return new URL(u).origin; } catch { return DEFAULT_LOGIN; } };

const ctx = await chromium.launchPersistentContext(userDataDir, {
  headless: false, viewport: null, locale: 'it-IT',
  args: ['--no-sandbox', '--start-maximized', '--disable-blink-features=AutomationControlled'],
});
const page = ctx.pages()[0] || await ctx.newPage();
// Accetta automaticamente eventuali alert/confirm nativi (es. avvisi al salvataggio)
page.on('dialog', d => d.accept().catch(() => {}));

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
page.on('request', (req) => {
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
page.on('response', async (resp) => {
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
    sniffPush({ kind: 'res', t: Date.now() - SNIFF.t0, type, status: resp.status(), ct, method: req.method(), url, body: String(body).slice(0, 8000) });
  } catch {}
});
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
  const c = creds();
  await page.goto(origin(c.loginUrl), { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2500);
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
  await page.goto(c.loginUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1800);
  // La landing pubblica NON ha il form: porta al vero form credenziali (login.php),
  // altrimenti clicca "Accedi con le tue credenziali".
  if (!(await hasPasswordField())) {
    await page.goto(origin(c.loginUrl) + '/login.php', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(1600);
  }
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
  await page.waitForTimeout(4500);
  if (!isLoginUrl(page.url()) && !(await hasPasswordField())) { log('autoLogin: loggato'); return true; }
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
  log('Auto-login non riuscito. Mappa con /logindump oppure accedi via VNC (127.0.0.1:5902).');
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
      const fileSub = u.searchParams.get('file') || 'preventivatore';
      const before = Math.min(600, parseInt(u.searchParams.get('before') || '160'));
      const after = Math.min(1200, parseInt(u.searchParams.get('after') || '500'));
      const out = await locked(async () => {
        await ensureOnPortal();
        return page.evaluate(async ({ q, fileSub, before, after }) => {
          const urls = [...new Set([...document.querySelectorAll('script[src]')].map(s => s.src).filter(u => /plurima\.net/i.test(u) && new RegExp(fileSub, 'i').test(u)))];
          const res = [];
          for (const u of urls.slice(0, 5)) {
            try {
              const t = await (await fetch(u)).text();
              const reG = new RegExp(q, 'gi'); let m, n = 0;
              while ((m = reG.exec(t)) && n < 10) { n++; res.push({ file: u.split('/').pop().split('?')[0], at: m.index, snippet: t.slice(Math.max(0, m.index - before), Math.min(t.length, m.index + after)) }); if (reG.lastIndex === m.index) reG.lastIndex++; }
            } catch (e) {}
          }
          return { matches: res.length, windows: res };
        }, { q, fileSub, before, after });
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
            window.__expInput = inp; return true;
          }, g('fill'));
          await page.waitForTimeout(400);
          if (g('enter') === '1') { await page.evaluate(() => { const i = window.__expInput; if (i) i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, bubbles: true })); }).catch(() => {}); await page.keyboard.press('Enter').catch(() => {}); }
          await page.waitForTimeout(3000); // attende l'eventuale lookup (popola i campi successivi)
        }
        if (g('select')) {
          did.select = g('select');
          did.selected = await page.evaluate((val) => {
            for (const s of document.querySelectorAll('select')) {
              if (!(s.offsetParent !== null)) continue;
              const opt = [...s.options].find(o => new RegExp(val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(o.textContent || ''));
              if (opt) { s.value = opt.value; s.dispatchEvent(new Event('change', { bubbles: true })); return true; }
            }
            return false;
          }, g('select'));
          await page.waitForTimeout(2500);
        }
        if (g('then')) { did.then = g('then'); did.thenClicked = await clickByText(g('then')); await page.waitForTimeout(3500); }
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
          const captured0 = doSniff ? sniffStop() : [];
          return { url: page.url(), did, grepjs: found, captured: captured0 };
        }
        await page.waitForTimeout(doSniff ? 4500 : 400);
        const captured = doSniff ? sniffStop() : [];
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
}).listen(4300, '127.0.0.1', () => log('Telecomando HTTP Italiana su 127.0.0.1:4300'));

async function keepAlive() {
  await locked(async () => {
    try {
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
