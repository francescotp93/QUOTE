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
import { creaFreno } from '../comune/freno.mjs';

/* Il freno sui tentativi di accesso. Senza, con le credenziali o il codice Duo
   non più validi questo servizio bussava al portale ogni 3 minuti per giorni:
   una notifica a Francesco a ogni tentativo e il rischio di farsi bloccare
   l'utenza. Vedi ../comune/freno.mjs. (01/08/2026) */
const FRENO = creaFreno();

const __dir = path.dirname(fileURLToPath(import.meta.url));
const userDataDir = path.join(__dir, 'userdata');
const STORE = process.env.FONTI_STORE || path.join(__dir, '../../server/fonti.store.json');

const PORTAL  = 'https://portaleagenzie.allianz.it';
const INQUIRY = 'https://portaleagenzie.allianz.it/Auto/InquiryAnia/Ricerca.aspx';
const LOGIN_URL = 'https://amlogin.allianz.it/nidp/idff/sso?id=6&sid=1&option=credential&sid=1&target=' +
  encodeURIComponent('https://portaleagenzie.allianz.it/Auto/InquiryAnia/Ricerca.aspx');
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

// È una pagina di login SSO (amlogin / nidp / Duo) o un errore di sessione?
const isLoginUrl = (url) => /amlogin\.allianz|nidp\/idff|duosecurity|\/login/i.test(url || '');
const onPortal = () => /portaleagenzie\.allianz/i.test(page.url());

async function loggedIn() {
  await page.goto(INQUIRY, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2500);
  if (isLoginUrl(page.url())) return false;
  // sulla pagina ANIA reale ci aspettiamo un form di ricerca targa
  return await page.evaluate(() => /targa|interrogazione|ania|ricerca/i.test(document.body.innerText || ''));
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
async function autoLogin() {
  const c = creds();
  if (!c.username || !c.password) { log('autoLogin: credenziali assenti nel Pannello Fonti'); return false; }
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const okU = await fillFirst(['input[name="Ecom_User_ID"]', 'input#Ecom_User_ID', 'input[name*="user" i]', 'input[name*="username" i]', 'input[type="text"]'], c.username);
  const okP = await fillFirst(['input[name="Ecom_Password"]', 'input#Ecom_Password', 'input[name*="pass" i]', 'input[type="password"]'], c.password);
  log('autoLogin: utente=', okU, 'password=', !!okP);
  if (!okU || !okP) return false;
  await submitForm();
  await page.waitForTimeout(4000);
  if (onPortal()) { log('autoLogin: loggato (sessione ricordata)'); return true; }

  // 2FA Duo: inserisce il PASSCODE (token Duo Mobile) salvato nel pannello — niente push
  if (!c.codice) { log('autoLogin: serve il codice Duo (inseriscilo nel pannello e premi "Accedi col codice")'); return false; }
  log('autoLogin: inserisco il passcode Duo dal pannello...');
  const okC = await enterPasscode(c.codice).catch(e => (log('enterPasscode err:', e.message), false));
  if (!okC) { log('autoLogin: campo passcode non trovato (usa "Diagnostica login")'); return false; }
  for (let i = 0; i < 12; i++) { await page.waitForTimeout(2000); if (onPortal()) { log('autoLogin: passcode accettato → loggato'); return true; } }
  log('autoLogin: passcode non accettato (scaduto/già usato?)');
  return onPortal();
}

/**
 * L'UNICA porta da cui passa un tentativo di accesso al portale. Tutto il resto
 * (keep-alive, /lookup, /login) chiama questa: se il freno fosse aggirabile da
 * un solo punto, il ciclo infinito tornerebbe da lì.
 */
async function tentaLogin(perche) {
  const s = FRENO.stato();
  if (!FRENO.puoTentare(Date.now())) {
    log('[freno] tentativo saltato —', s.bloccato
      ? 'fermo dopo ' + s.tentativi_falliti + ' fallimenti di fila: serve un codice nuovo dal Pannello Fonti'
      : 'in attesa, prossimo tentativo ' + new Date(s.prossimo_tentativo).toLocaleTimeString('it-IT'));
    return false;
  }
  const ok = await autoLogin().catch(e => (log('autoLogin err:', e.message), false));
  if (ok) FRENO.riuscito();
  else {
    FRENO.fallito(Date.now(), perche || 'accesso rifiutato: credenziali o codice Duo non più validi');
    const d = FRENO.stato();
    if (d.bloccato) log('[freno] FERMO dopo', d.tentativi_falliti,
      'tentativi falliti di fila. Non ribusso più: metti un codice nuovo dal Pannello Fonti.');
  }
  return ok;
}

async function ensureLogin() {
  if (await loggedIn()) return true;
  log('Non loggato: provo auto-login...');
  if (await tentaLogin()) { log('Auto-login OK'); return true; }
  log('Auto-login non riuscito. Mappa con /otpdump oppure accedi via VNC (127.0.0.1:5901).');
  await page.goto(LOGIN_URL).catch(() => {});
  return false; // il browser resta sulla pagina di login (pronto per VNC); il server HTTP parte subito
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

// Interrogazione ANIA: apre Ricerca.aspx, compila la targa e invia. v1 best-effort:
// la mappatura fine dei campi (id ASP.NET) si fa dopo il primo dump reale.
async function cercaTarga(targa) {
  await page.goto(INQUIRY, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1500);
  // campo targa: cerca per name/id contenenti "targa", altrimenti il primo input testuale
  const filled = await page.evaluate((t) => {
    const ins = [...document.querySelectorAll('input[type=text],input:not([type])')];
    let el = ins.find(i => /targa|plate/i.test((i.name || '') + (i.id || '')));
    if (!el) el = ins.find(i => (i.maxLength === 7 || i.maxLength === 8) || /targa/i.test(i.placeholder || ''));
    if (!el) el = ins[0];
    if (!el) return false;
    el.focus(); el.value = t;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, targa);
  await page.waitForTimeout(400);
  // invio: bottone Cerca/Ricerca/Interroga, altrimenti submit del form
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button,input[type=submit],a')].find(x => /cerca|ricerc|interrog|invia|conferma/i.test((x.innerText || x.value || '')));
    if (b) b.click();
  });
  await page.waitForTimeout(3000);
  return filled;
}

// Serializza le operazioni sulla pagina: keep-alive e richieste non si sovrappongono.
let CHAIN = Promise.resolve();
function locked(fn) { const run = CHAIN.then(fn, fn); CHAIN = run.then(() => {}, () => {}); return run; }

http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const u = new URL(req.url, 'http://x');
    if (u.pathname.startsWith('/status')) {
      const c = creds();
      return res.end(JSON.stringify({ url: page.url(), loggato: onPortal(), ha_credenziali: !!(c.username && c.password), ha_totp: !!c.totp, freno: FRENO.stato() }));
    }
    if (u.pathname.startsWith('/login')) { // forza un tentativo di (auto)login
      /* Qui c'è una persona che ha appena messo un codice nuovo nel pannello e
         chiede di riprovare: è l'unico gesto che toglie il freno. */
      FRENO.sblocca();
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
        const filled = await cercaTarga(targa);
        await page.screenshot({ path: 'shots/lookup.png', fullPage: true }).catch(() => {});
        return { ok: true, targa, campo_targa_compilato: filled, _dump: await richDump() };
      });
      return res.end(JSON.stringify(out, null, 2));
    }
    if (u.pathname.startsWith('/shot')) { await page.screenshot({ path: 'shots/current.png', fullPage: true }).catch(() => {}); return res.end(JSON.stringify({ ok: true, url: page.url() })); }
    res.end(JSON.stringify({ endpoints: ['/status', '/login', '/logindump', '/otpdump', '/lookup?targa=..', '/shot'] }));
  } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e) })); }
}).listen(4200, '127.0.0.1', () => log('Telecomando HTTP Allianz su 127.0.0.1:4200'));

// Keep-alive "umano": ogni ~3 min naviga nel portale e simula attività (mouse + scroll)
// così la sessione non va MAI in timeout per inattività. Se la trova caduta, prova un
// ri-login silenzioso (riesce senza Duo finché il cookie SSO è ancora valido).
async function keepAlive() {
  /* A freno tirato non c'è più niente da tenere vivo: la sessione è già persa e
     l'unica cosa che si otterrebbe girando a vuoto è traffico inutile verso il
     portale di una compagnia. Si riparte quando arriva un codice nuovo. */
  if (FRENO.stato().bloccato) return;
  await locked(async () => {
    try {
      const dest = Math.random() < 0.5 ? PORTAL : INQUIRY;
      await page.goto(dest, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.mouse.move(150 + Math.random() * 500, 150 + Math.random() * 350).catch(() => {});
      await page.evaluate(() => { window.scrollBy(0, 140); setTimeout(() => window.scrollTo(0, 0), 300); }).catch(() => {});
      await page.waitForTimeout(500);
      if (isLoginUrl(page.url())) {
        log('[keep-alive] sessione caduta → ri-login silenzioso...');
        const ok = await tentaLogin('sessione caduta e ri-login non riuscito');
        log('[keep-alive] ri-login', ok ? 'OK' : 'fallito (serve approvazione Duo)');
      } else log('[keep-alive] attività ok →', page.url());
    } catch (e) { log('[keep-alive] err:', e.message); }
  });
}
setInterval(keepAlive, 3 * 60 * 1000);
log('=== SERVIZIO ALLIANZ ATTIVO (v2 · login Duo col codice) ===');
await new Promise(() => {});
