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

const isLoginUrl = (url) => /login|signin|accedi|auth|sso|nidp|duosecurity/i.test(url || '');
async function hasPasswordField() {
  return await page.evaluate(() => !!document.querySelector('input[type=password]')).catch(() => false);
}
// Loggato = pagina del portale che NON è il login e senza campo password.
async function loggedIn() {
  const c = creds();
  await page.goto(origin(c.loginUrl), { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2500);
  if (isLoginUrl(page.url())) return false;
  return !(await hasPasswordField());
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

// ── Preventivo AUTO · Step 1 (Dati Base): targa → lente → situazione assicurativa ─
// Best-effort: ritorna anche la "mappa" della pagina (campi reali) per tarare i passi.
async function autoStep1(o = {}) {
  const base = origin(creds().loginUrl);
  await page.goto(base + '/auto', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2500);
  if (isLoginUrl(page.url()) || await hasPasswordField()) {
    await ensureLogin(); await page.goto(base + '/auto', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }
  const steps = { targa: false, lente: false, situazione: false, attestato: false };
  if (o.targa) {
    steps.targa = await page.evaluate((t) => {
      const vis = e => e && e.offsetParent !== null;
      const inp = [...document.querySelectorAll('input[type=text],input:not([type])')].filter(vis)[0];
      if (!inp) return false;
      inp.focus(); inp.value = t; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, String(o.targa).toUpperCase());
    await page.waitForTimeout(400);
    // click sulla lente (icona di ricerca accanto alla targa)
    steps.lente = await page.evaluate(() => {
      const vis = e => e && e.offsetParent !== null;
      const inp = [...document.querySelectorAll('input[type=text],input:not([type])')].filter(vis)[0];
      if (!inp) return false;
      const cont = inp.closest('div,form,section') || document;
      const cand = [...cont.querySelectorAll('button,a,i,span,[role=button]')].find(b => {
        const s = (b.className || '') + ' ' + (b.getAttribute('aria-label') || '');
        return /search|lente|cerca|magnif|fa-search|ti-search/i.test(s) || b.querySelector('svg,i,img');
      });
      if (cand) { (cand.closest('button,a,[role=button]') || cand).click(); return true; }
      return false;
    });
    await page.waitForTimeout(4000); // attende il recupero veicolo dalla banca dati
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

// ── Estrazione dati veicolo + ALLESTIMENTI dalla pagina Plurima ─────────────────
// Gira nel contesto del browser (niente API Node qui dentro). Best-effort ed
// euristica: i selettori esatti si tarano al primo run reale guardando `debug.selects`
// nella risposta di /veicolo (oppure /logindump). Plurima mostra le versioni in una
// vera <select>; da lì leggiamo descrizione + valore assicurato di ogni allestimento.
function extractVeicoloInPage() {
  const norm = s => (s || '').replace(/\s+/g, ' ').trim();
  const vis = e => e && e.offsetParent !== null;
  // "12.345,67" / "12.345" / "12345,00" → 12345.67  (formato numerico italiano)
  const numIt = s => {
    const m = norm(s).match(/\d[\d.\s]*(?:,\d+)?/);
    if (!m) return null;
    const n = parseFloat(m[0].replace(/[.\s]/g, '').replace(',', '.'));
    return isFinite(n) ? n : null;
  };
  // Valore corrente di un controllo (input o select)
  const ctrlVal = el => el ? norm(el.value || (el.selectedOptions && el.selectedOptions[0] && el.selectedOptions[0].textContent) || '') : '';
  // Trova il valore di un campo a partire dall'etichetta vicina (label[for], label che
  // contiene il campo, oppure pattern "Etichetta: valore" nel testo).
  function fieldByLabel(re) {
    for (const l of document.querySelectorAll('label')) {
      if (!re.test(l.textContent || '')) continue;
      const forId = l.getAttribute('for');
      let inp = forId ? document.getElementById(forId) : l.querySelector('input,select');
      if (!inp) { const c = l.closest('div,td,tr,li,p'); inp = c && c.querySelector('input,select'); }
      if (inp) return ctrlVal(inp);
    }
    // fallback: cella di tabella "Etichetta" → cella accanto
    for (const th of document.querySelectorAll('th,td,dt,span,b,strong')) {
      if (!re.test(th.textContent || '')) continue;
      const sib = th.nextElementSibling;
      if (sib && norm(sib.textContent)) return norm(sib.textContent);
    }
    return '';
  }

  // Tutte le select visibili (debug + scelta della select allestimenti)
  const selects = [...document.querySelectorAll('select')].filter(vis).map((s, i) => {
    const lab = (() => {
      const id = s.id; if (id) { const l = document.querySelector('label[for="' + id + '"]'); if (l) return norm(l.textContent); }
      const c = s.closest('div,td,tr,li,p'); const l = c && c.querySelector('label'); return l ? norm(l.textContent) : '';
    })();
    return {
      idx: i, id: s.id || '', name: s.name || '', label: lab,
      options: [...s.options].slice(0, 60).map(o => ({ text: norm(o.textContent), value: o.value })),
    };
  });

  // La select degli allestimenti: per etichetta (allestimento/versione), altrimenti
  // la select con più opzioni "veicolari" (esclude select brevi tipo SI/NO, mesi, ecc.).
  const looksVehicle = txt => /\b(\d{3,4}\s?cc|\d{2,3}\s?cv|\d{2,3}\s?kw|tdi|tsi|cdi|dci|hdi|benzina|diesel|gpl|metano|ibrid|\d\.\d)\b/i.test(txt || '');
  let allestSel = selects.find(s => /allestiment|versione|modello/i.test(s.label) && s.options.length > 1) || null;
  if (!allestSel) {
    const scored = selects
      .filter(s => s.options.length > 2)
      .map(s => ({ s, score: s.options.filter(o => looksVehicle(o.text)).length }))
      .sort((a, b) => b.score - a.score)[0];
    if (scored && scored.score > 0) allestSel = scored.s;
  }

  // Ogni allestimento porta il suo CODICE (MotorNet/Infocar), che su Plurima sta
  // nel value della <option>. È la chiave della banca dati: codice → marca/modello/
  // cilindrata/cavalli/allestimento. La descrizione è il testo della option.
  let allestimenti = [];
  let allestimento = '';
  let allestimentoCodice = '';
  if (allestSel) {
    const liveSel = [...document.querySelectorAll('select')].filter(vis)[allestSel.idx];
    allestimenti = allestSel.options
      .filter(o => o.text && !/^[-—]+$|seleziona|scegli/i.test(o.text))
      .map(o => ({ descrizione: o.text, codice: norm(o.value) }));
    if (liveSel) { allestimento = ctrlVal(liveSel); allestimentoCodice = norm(liveSel.value); }
    else if (allestimenti[0]) { allestimento = allestimenti[0].descrizione; allestimentoCodice = allestimenti[0].codice; }
  }

  // Codice del veicolo risolto: campo esplicito se c'è, altrimenti il value della
  // option allestimento selezionata.
  const codiceCampo = fieldByLabel(/motornet|infocar|codice\s*motore|cod\.?\s*veicolo/i);

  return {
    marca: fieldByLabel(/marca|casa\s*costruttrice/i),
    modello: fieldByLabel(/modello/i),
    allestimento,
    allestimenti,
    alimentazione: fieldByLabel(/alimentazione|carburante/i),
    cilindrata: numIt(fieldByLabel(/cilindrata|\bcc\b/i)),
    kilowatt: numIt(fieldByLabel(/\bkw\b|potenza/i)),
    cavalli: numIt(fieldByLabel(/cavalli|\bcv\b/i)),
    data_immatricolazione: fieldByLabel(/immatricol/i),
    valore: numIt(fieldByLabel(/valore\s*assicurat|valore\s*commerciale|valore/i)),
    codice_motornet: codiceCampo || allestimentoCodice || '',
    debug: { url: location.href, selects },
  };
}

// Carica il veicolo dalla targa (targa + lente, riusa autoStep1) e ne estrae i dati
// strutturati comprensivi dell'elenco allestimenti.
async function autoVeicolo(o = {}) {
  const s1 = await autoStep1({ targa: o.targa, situazione: o.situazione || '' });
  await page.waitForTimeout(1500); // la banca dati può popolare la select versioni con un attimo di ritardo
  const veicolo = await page.evaluate(extractVeicoloInPage).catch(e => ({ _error: e.message }));
  await page.screenshot({ path: 'shots/auto-veicolo.png', fullPage: true }).catch(() => {});
  const trovato = !!(veicolo && (veicolo.marca || veicolo.modello || (veicolo.allestimenti && veicolo.allestimenti.length)));
  return { ok: trovato, veicolo, steps: s1.steps, url: page.url() };
}

let CHAIN = Promise.resolve();
function locked(fn) { const run = CHAIN.then(fn, fn); CHAIN = run.then(() => {}, () => {}); return run; }

http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const u = new URL(req.url, 'http://x');
    if (u.pathname.startsWith('/status')) {
      const c = creds();
      return res.end(JSON.stringify({ url: page.url(), loggato: !isLoginUrl(page.url()) && !(await hasPasswordField()), ha_credenziali: !!(c.username && c.password) }));
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
    if (u.pathname.startsWith('/auto')) { // preventivo auto step 1 + mappa pagina
      const out = await locked(() => autoStep1({
        targa: (u.searchParams.get('targa') || '').toUpperCase().trim(),
        situazione: u.searchParams.get('situazione') || '',
        attestato: u.searchParams.get('attestato') || '',
      }).catch(e => ({ error: e.message })));
      return res.end(JSON.stringify(out, null, 2));
    }
    if (u.pathname.startsWith('/veicolo')) { // targa → dati veicolo + elenco allestimenti (per la tendina QUOTO)
      const out = await locked(() => autoVeicolo({
        targa: (u.searchParams.get('targa') || '').toUpperCase().trim(),
        situazione: u.searchParams.get('situazione') || '',
      }).catch(e => ({ ok: false, error: e.message })));
      return res.end(JSON.stringify(out, null, 2));
    }
    if (u.pathname.startsWith('/shot')) { await page.screenshot({ path: 'shots/current.png', fullPage: true }).catch(() => {}); return res.end(JSON.stringify({ ok: true, url: page.url() })); }
    res.end(JSON.stringify({ endpoints: ['/status', '/login', '/logindump', '/auto?targa=..&situazione=..', '/veicolo?targa=..&situazione=..', '/shot'] }));
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
      if (isLoginUrl(page.url()) || await hasPasswordField()) {
        log('[keep-alive] sessione caduta → ri-login...');
        await autoLogin().catch(() => false);
      }
    } catch (e) { log('[keep-alive] err:', e.message); }
  });
}
setInterval(keepAlive, 3 * 60 * 1000);
log('=== SERVIZIO ITALIANA ATTIVO (login generico) ===');
await new Promise(() => {});
