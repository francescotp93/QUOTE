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
  const veicolo = await readFields(['Marca', 'Modello', 'Allestimento', 'Alimentazione', 'Cilindrata', 'Kilowatt', 'Data immatricolazione', 'Tipo veicolo']);
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
  return { ok: !!prezzo.premio, premio: prezzo.premio, provvigioni: prezzo.provvigioni, compagnia: prezzo.compagnia, daAutorizzare: prezzo.daAutorizzare, anagrafica, veicolo, trace, url: page.url(), dump: await richDump() };
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
    if (u.pathname.startsWith('/preventivo')) { // preventivo auto COMPLETO (4 step) → premio
      const g = k => u.searchParams.get(k) || '';
      const out = await locked(() => autoPreventivo({
        targa: g('targa').toUpperCase().trim(), situazione: g('situazione'), attestato: g('attestato'),
        bersani: g('bersani'), tipoGuida: g('tipoGuida'), frazionamento: g('frazionamento'),
        massimale: g('massimale'), dataUltimaVoltura: g('dataUltimaVoltura'), indirizzo: g('indirizzo'),
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
    res.end(JSON.stringify({ endpoints: ['/status', '/login', '/logindump', '/auto?targa=..&situazione=..', '/shot'] }));
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
