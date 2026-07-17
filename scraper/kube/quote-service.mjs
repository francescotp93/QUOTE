// ─────────────────────────────────────────────────────────
//  Kube (preventivatore auto) — scraper portale per CATTURA/ANALISI.
//  Porta 4900, display :91, VNC 5908. Credenziali dal Pannello Fonti (fonte ~ "kube").
//  Login generico utente+password. Sessione persistente (userdata). Telecomando HTTP
//  identico agli altri scraper (status, accedi, esplora, sniff, screenshot).
//  Scopo iniziale: loggarsi e MAPPARE il flusso preventivo auto per ricostruirlo.
// ─────────────────────────────────────────────────────────
import { chromium } from 'playwright';
import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const userDataDir = path.join(__dir, 'userdata');
const STORE = process.env.FONTI_STORE || path.join(__dir, '../../server/fonti.store.json');
const FONTE_ID = process.env.FONTE_ID || 'c-kube';
const PORT = parseInt(process.env.PORT || '4900', 10);
const log = (...a) => console.log(new Date().toLocaleTimeString('it-IT'), '[kube]', ...a);

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
    for (const k of Object.keys(cs)) if (/kube/i.test(cs[k].nome || '')) return cs[k];
    return {};
  } catch { return {}; }
}
function safeLoginUrl(raw) {
  const u = (raw && String(raw).trim()) || '';
  if (!u) return '';
  if (/[?&](code|state|session_state|token|ticket)=/i.test(u)) return u.split('?')[0];
  return u;
}
function creds() {
  const s = rawFonte();
  return { username: dec(s.username), password: dec(s.password), loginUrl: safeLoginUrl(s.url) };
}
const hostOf = (u) => { try { return new URL(u).host; } catch { return ''; } };
const origin = (u) => { try { return new URL(u).origin; } catch { return ''; } };

async function launchCtx() {
  for (const f of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) { try { fs.rmSync(userDataDir + '/' + f, { force: true }); } catch {} }
  const c = await chromium.launchPersistentContext(userDataDir, {
    headless: false, viewport: null, locale: 'it-IT',
    args: ['--no-sandbox', '--start-maximized', '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage', '--disable-gpu', '--disable-software-rasterizer', '--disable-extensions',
      '--disable-component-update', '--disable-background-networking', '--disable-sync', '--mute-audio',
      '--no-first-run', '--no-default-browser-check', '--metrics-recording-only',
      '--disable-features=Translate,MediaRouter,OptimizationHints,BackForwardCache', '--renderer-process-limit=4'],
  });
  try {
    const BLOCK = /googletagmanager|google-analytics|\/collect(\?|$)|doubleclick|hotjar|fullstory|mouseflow|clarity\.ms|optimizely|segment\.(io|com)|facebook\.(com|net)|fbcdn|onetrust|cookielaw|quantserve|scorecardresearch/i;
    await c.route('**/*', route => { try { const r = route.request(), ty = r.resourceType(); if (ty === 'media' || ty === 'font' || BLOCK.test(r.url())) return route.abort(); return route.continue(); } catch { try { return route.continue(); } catch {} } });
  } catch {}
  return c;
}
let ctx = await launchCtx();
let page = ctx.pages()[0] || await ctx.newPage();

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
    catch (e2) { log('[recovery] rilancio fallito (' + e2.message + ') → esco'); process.exit(1); }
  }
}

const isLoginUrl = (url) => /login|signin|accedi|auth|sso/i.test(String(url || '').split('?')[0]);
async function hasPasswordField() { return await page.$('input[type=password]').then(e => !!e).catch(() => false); }

let BUSY = false;
let logCache = { v: false, t: 0 };
const setLogged = (v) => { logCache = { v, t: Date.now() }; };
let STATE = { running: false, step: 'idle', since: 0, msg: '' };
const setState = (step, msg, running = false) => { STATE = { running, step, since: Date.now(), msg }; if (step === 'loggato') setLogged(true); else if (['pronto', 'non_loggato', 'error'].includes(step)) setLogged(false); return STATE; };

async function loggedIn() {
  if (BUSY) return logCache.v;
  if (Date.now() - logCache.t < 30000) return logCache.v;
  await ensurePage();
  const c = creds();
  const host = hostOf(c.loginUrl);
  let u = page.url() || '';
  const offsite = !u || u === 'about:blank' || (host && !u.includes(host));
  if (offsite && c.loginUrl) { await page.goto(c.loginUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}); await page.waitForTimeout(2500); u = page.url() || ''; }
  const hasPw = await hasPasswordField();
  const r = !!u && u !== 'about:blank' && !hasPw && !isLoginUrl(u);
  setLogged(r);
  return r;
}

async function doAccedi() {
  if (BUSY) return STATE;
  BUSY = true;
  try {
    setState('credenziali', 'Apro Kube e invio le credenziali…', true);
    await ensurePage();
    const c = creds();
    if (!c.loginUrl) return setState('error', 'URL di login assente nel Pannello Fonti (fonte Kube).');
    if (!c.username || !c.password) return setState('error', 'Credenziali assenti nel Pannello Fonti (utente/password).');
    await page.goto(c.loginUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(2000);
    if (await loggedIn()) { await ctx.storageState({ path: path.join(__dir, 'auth.json') }).catch(() => {}); return setState('loggato', 'Sessione già attiva ✅'); }
    // Blazor (@bind) sincronizza il model server-side sull'evento change (blur), non su input:
    // .fill() da solo lascia le credenziali "vuote" lato server -> login nullo senza errore.
    // Quindi: digitazione reale (pressSequentially) + Tab per forzare il blur/change.
    try { const user = page.locator('input[type="email"]:visible, input[name*="user" i]:visible, input[name*="email" i]:visible, input[id*="user" i]:visible, input[type="text"]:visible, input:not([type]):visible').first(); if (await user.count().catch(() => 0)) { await user.click({ timeout: 5000 }).catch(() => {}); await user.fill('', { timeout: 3000 }).catch(() => {}); await user.pressSequentially(c.username, { delay: 40, timeout: 8000 }); await page.keyboard.press('Tab'); await page.waitForTimeout(300); } } catch (e) {}
    try { const pwd = page.locator('input[type="password"]:visible').first(); if (await pwd.count().catch(() => 0)) { await pwd.click({ timeout: 5000 }).catch(() => {}); await pwd.fill('', { timeout: 3000 }).catch(() => {}); await pwd.pressSequentially(c.password, { delay: 60, timeout: 8000 }); await page.keyboard.press('Tab'); await page.waitForTimeout(500); } } catch (e) {}
    await page.waitForTimeout(300);
    let clicked = false;
    // "connetti"/"connect" aggiunti: il bottone di Kube e' "CONNETTI" (mancava -> click mai eseguito -> fallback Invio inefficace su Blazor).
    for (const re of [/^\s*(connetti|connect|accedi|entra|login|log\s*in|sign\s*in|accesso|conferma|prosegui|continua)\s*$/i]) {
      const b = page.getByRole('button', { name: re }).first();
      try { if (await b.count()) { await b.click({ timeout: 4500 }); clicked = true; break; } } catch (e) {}
      const l = page.locator('input[type=submit], button, a[role=button]').filter({ hasText: re }).first();
      try { if (!clicked && await l.count()) { await l.click({ timeout: 3000 }); clicked = true; break; } } catch (e) {}
    }
    if (!clicked) { try { await page.locator('input[type=password]:visible').first().press('Enter', { timeout: 3000 }); } catch (e) {} }
    for (let i = 0; i < 16; i++) { await page.waitForTimeout(1500); if (await loggedIn()) break; }
    if (await loggedIn()) { await ctx.storageState({ path: path.join(__dir, 'auth.json') }).catch(() => {}); return setState('loggato', 'Login completato ✅'); }
    return setState('non_loggato', 'Login non riuscito: controlla utente/password/URL (o c’è un passaggio extra da mappare via VNC).');
  } catch (e) { return setState('error', e.message); }
  finally { BUSY = false; }
}

(async () => {
  try { await ensurePage(); if (await loggedIn()) { setState('loggato', 'Sessione attiva'); log('sessione persistente attiva ✅'); } else { setState('pronto', 'Pronto: avvia il login'); log('PRONTO al login'); } }
  catch (e) { log('check iniziale err:', e.message); }
})();
setInterval(async () => { if (STATE.running || BUSY) return; try { await ensurePage(); const c = creds(); const host = hostOf(c.loginUrl); if (c.loginUrl && host && !(page.url() || '').includes(host)) await page.goto(c.loginUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch {} }, 5 * 60 * 1000);

http.createServer(async (req, res) => {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname.startsWith('/status')) {
      let loggato = false; try { loggato = await loggedIn(); } catch {}
      const c = creds();
      return res.end(JSON.stringify({ url: page.url(), loggato, login_step: STATE.step, login_running: STATE.running, ha_credenziali: !!(c.username && c.password), ha_url: !!c.loginUrl, login_msg: STATE.msg || '' }));
    }
    if (u.pathname.startsWith('/loginstate')) return res.end(JSON.stringify(STATE));
    if (u.pathname === '/accedi' || u.pathname === '/login') {
      doAccedi(); await new Promise(r => setTimeout(r, 400)); const st = STATE;
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
    if (u.pathname.startsWith('/probe')) {
      const q = (u.searchParams.get('q') || 'accedi').toLowerCase();
      const out = [];
      for (const fr of [page.mainFrame(), ...page.frames()]) {
        const found = await fr.evaluate((q) => { const re = new RegExp(q, 'i'); return [...document.querySelectorAll('*')].filter(e => re.test((e.innerText || e.value || e.getAttribute('alt') || e.getAttribute('onclick') || ''))).slice(0, 6).map(e => ({ tag: e.tagName.toLowerCase(), type: e.type || '', id: e.id || '', name: e.name || '', html: e.outerHTML.slice(0, 220) })); }, q).catch(() => []);
        if (found.length) out.push({ frame: (fr.url() || '').slice(0, 60), els: found });
      }
      return res.end(JSON.stringify({ frames: page.frames().length, matches: out }, null, 2));
    }
    if (u.pathname.startsWith('/sniff/start')) { sniffStart(); return res.end(JSON.stringify({ ok: true, recording: true })); }
    if (u.pathname.startsWith('/sniff/stop')) { const buf = sniffStop(); return res.end(JSON.stringify({ ok: true, recording: false, captured: buf.length, calls: buf }, null, 2)); }
    if (u.pathname.startsWith('/explore')) {
      const g = k => u.searchParams.get(k) || '';
      const doSniff = g('sniff') === '1';
      if (doSniff) sniffStart();
      const before = ctx.pages().length;
      if (g('goto')) { let p = g('goto'); if (!/^https?:/i.test(p)) p = origin(creds().loginUrl) + (p.startsWith('/') ? p : '/' + p); await page.goto(p, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}); await page.waitForTimeout(2500); }
      const pickFrame = async () => {
        const want = g('frame'); const frames = page.frames();
        if (want) { const f = frames.find(fr => (fr.url() || '').toLowerCase().includes(want.toLowerCase())); if (f) return f; }
        let best = page.mainFrame(), bestLen = 0;
        for (const fr of frames) { const n = await fr.evaluate(() => (document.body && document.body.innerText || '').length).catch(() => 0); if (n > bestLen) { bestLen = n; best = fr; } }
        return best;
      };
      let fr = await pickFrame();
      if (g('hover')) { try { await fr.getByText(g('hover'), { exact: false }).first().hover({ timeout: 4000 }); } catch (e) {} await page.waitForTimeout(1500); }
      if (g('click')) {
        const t = g('click');
        const cands = [fr.getByRole('button', { name: t }), fr.getByRole('link', { name: t }), fr.getByRole('menuitem', { name: t }), fr.getByText(t, { exact: true }), fr.getByText(t, { exact: false }), fr.locator('text=' + t)];
        for (const loc of cands) { try { const el = loc.first(); if (await el.count()) { await el.click({ timeout: 4500 }); break; } } catch (e) {} }
        await page.waitForTimeout(2800);
      }
      if (g('fill')) {
        const val = g('fill');
        const sel = g('fillsel') || 'input[type=text]:visible, input:not([type]):visible, input[type=search]:visible';
        try { const el = fr.locator(sel).first(); await el.click({ timeout: 3000, force: true }).catch(() => {}); await el.fill(val, { timeout: 5000, force: true }); } catch (e) {}
        await page.waitForTimeout(800);
      }
      const pgs = ctx.pages();
      if (pgs.length > before) { const np = pgs[pgs.length - 1]; if (np && !np.isClosed()) { page = np; await page.waitForLoadState('domcontentloaded').catch(() => {}); await page.waitForTimeout(1500); fr = await pickFrame(); } }
      const all = g('all') === '1';
      const dump = await fr.evaluate((all) => {
        const vis = e => e && e.offsetParent !== null;
        const labelOf = e => { try { const c = e.closest('div,td,label,fieldset,th'); return (c ? (c.innerText || '') : '').replace(/\s+/g, ' ').trim().slice(0, 28); } catch { return ''; } };
        const fields = [...document.querySelectorAll('input,select')].filter(vis).slice(0, 70).map(e => ({ tag: e.tagName.toLowerCase(), type: e.type || '', id: e.id || '', name: e.name || '', placeholder: e.placeholder || '', val: String(e.value || '').slice(0, 30), lbl: labelOf(e) }));
        const links = [...document.querySelectorAll('a,button,[role=button],input[type=submit],input[type=button]')].filter(e => all || vis(e)).slice(0, 90)
          .map(e => ({ t: (e.innerText || e.title || e.value || '').trim().slice(0, 45), href: (e.getAttribute && e.getAttribute('href')) || '', id: e.id || '', vis: vis(e) })).filter(x => x.t || x.href);
        return { url: location.href, title: document.title, text: (document.body.innerText || '').slice(0, 600), fields, links };
      }, all).catch(e => ({ error: e.message }));
      const frameInfo = page.frames().map(f => ({ url: (f.url() || '').slice(0, 80) }));
      const captured = doSniff ? sniffStop().map(e => ({ k: e.kind, m: e.method, s: e.status, url: e.url, body: String(e.body || '').slice(0, 1500) })) : [];
      return res.end(JSON.stringify({ ...dump, frame: fr.url().slice(0, 80), frames: frameInfo, npages: ctx.pages().length, captured }, null, 2));
    }
    if (u.pathname.startsWith('/shot')) {
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
    res.statusCode = 404; return res.end(JSON.stringify({ error: 'endpoint sconosciuto' }));
  } catch (e) { res.statusCode = 500; return res.end(JSON.stringify({ error: e.message })); }
}).listen(PORT, '127.0.0.1', () => log('telecomando HTTP su 127.0.0.1:' + PORT));
