// Servizio: browser PERSISTENTE loggato + keep-alive + telecomando HTTP (localhost:4100).
import { chromium } from 'playwright';
import http from 'http';

const userDataDir = new URL('./userdata', import.meta.url).pathname;
const PORTAL    = 'https://www.24hassistance.com';
const LOGIN_URL = 'https://login.24hassistance.com/?ReturnUrl=https://www.24hassistance.com';
const FASTQUOTE = 'https://www.24hassistance.com/motoplatinum/v2#/quotation/fastquote';
const log = (...a) => console.log(new Date().toLocaleTimeString('it-IT'), ...a);

const ctx = await chromium.launchPersistentContext(userDataDir, {
  headless: false, viewport: null, locale: 'it-IT',
  args: ['--no-sandbox', '--start-maximized', '--disable-blink-features=AutomationControlled'],
});
const page = ctx.pages()[0] || await ctx.newPage();

async function loggedIn() {
  await page.goto(PORTAL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2500);
  if (/login\.24hassistance/i.test(page.url())) return false;
  return await page.evaluate(() => /esci|logout|area riservat|preventiv|i miei|polizz/i.test(document.body.innerText || ''));
}

let ok = await loggedIn();
if (!ok) {
  log('🔓 Non loggato: apro il login, accedi via VNC…');
  await page.goto(LOGIN_URL).catch(() => {});
  for (let i = 0; i < 100; i++) { await page.waitForTimeout(3000); if (!/login\.24hassistance/i.test(page.url())) { ok = true; break; } }
}
log(ok ? '✅ LOGGATO: ' + page.url() : '⚠️  login non rilevato');
if (ok) await ctx.storageState({ path: 'auth.json' }).catch(() => {});

function dumpFields() {
  return page.evaluate(() => {
    const clean = s => (s || '').replace(/\s+/g, ' ').trim().slice(0, 45) || null;
    return [...document.querySelectorAll('input,select,textarea,button,[role=button]')].map(el => ({
      tag: el.tagName.toLowerCase(), type: el.getAttribute('type') || null,
      name: el.getAttribute('name') || null, id: el.id || null,
      ph: el.getAttribute('placeholder') || null, aria: el.getAttribute('aria-label') || null,
      text: clean(el.innerText || el.value),
    })).filter(f => f.type !== 'hidden');
  });
}

// ── Telecomando HTTP (solo localhost) ─────────────────────────────────────────
http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    if (req.url.startsWith('/status')) {
      return res.end(JSON.stringify({ url: page.url() }));
    }
    if (req.url.startsWith('/debug/fastquote')) {
      log('→ vado al fastquote…');
      await page.goto(FASTQUOTE, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(3500);
      await page.screenshot({ path: 'shots/fastquote.png', fullPage: true });
      const fields = await dumpFields();
      log('📸 shots/fastquote.png + ' + fields.length + ' campi');
      return res.end(JSON.stringify({ url: page.url(), fields }, null, 2));
    }
    if (req.url.startsWith('/quote')) {
      const u = new URL(req.url, 'http://x');
      const targa = (u.searchParams.get('targa') || '').toUpperCase().trim();
      const nascita = (u.searchParams.get('nascita') || '').trim(); // GG/MM/AAAA
      if (!targa || !nascita) return res.end(JSON.stringify({ error: 'Uso: /quote?targa=AB12345&nascita=GG/MM/AAAA' }));
      log('→ Preventivo:', targa, nascita);
      await page.goto(FASTQUOTE, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(3000);
      try { await page.locator('button:has-text("Accetta")').first().click({ timeout: 2500 }); } catch {}
      // compila data + targa
      await page.fill('#FastQuoteBirthDate', nascita).catch(() => {});
      await page.fill('#FastQuotePlate', targa).catch(() => {});
      await page.waitForTimeout(600);
      await page.screenshot({ path: 'shots/quote-1-compilato.png', fullPage: true });
      // calcola
      await page.click('#cta_mp_fastquote_1').catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(4500);
      await page.screenshot({ path: 'shots/quote-2-risultato.png', fullPage: true });
      const fields = await dumpFields();
      const bodyText = (await page.evaluate(() => document.body.innerText || '')).replace(/\n{2,}/g, '\n').slice(0, 900);
      log('📸 quote-1-compilato.png + quote-2-risultato.png');
      return res.end(JSON.stringify({ url: page.url(), bodyText, fields }, null, 2));
    }
    if (req.url.startsWith('/shot')) { // ri-screenshot della pagina corrente
      await page.screenshot({ path: 'shots/current.png', fullPage: true });
      return res.end(JSON.stringify({ ok: true, url: page.url() }));
    }
    res.end(JSON.stringify({ endpoints: ['/status','/debug/fastquote','/quote?targa=..&nascita=GG/MM/AAAA','/shot'] }));
  } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e) })); }
}).listen(4100, '127.0.0.1', () => log('🎮 Telecomando HTTP su 127.0.0.1:4100'));

// keep-alive ogni 4 minuti
setInterval(async () => {
  try { await page.goto(PORTAL, { waitUntil: 'domcontentloaded', timeout: 45000 }); log('[keep-alive] ok'); }
  catch (e) { log('[keep-alive] err:', e.message); }
}, 4 * 60 * 1000);

log('=== SERVIZIO ATTIVO. Lascia aperto. Comandi via: curl localhost:4100/... ===');
await new Promise(() => {});
