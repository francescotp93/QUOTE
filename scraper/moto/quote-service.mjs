// Servizio: browser PERSISTENTE loggato, tenuto vivo. Riusa ./userdata (la tua sessione).
import { chromium } from 'playwright';

const userDataDir = new URL('./userdata', import.meta.url).pathname;
const PORTAL    = 'https://www.24hassistance.com';
const LOGIN_URL = 'https://login.24hassistance.com/?ReturnUrl=https://www.24hassistance.com';
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
  return await page.evaluate(() => /esci|logout|area riservat|le mie polizz|preventiv|i miei/i.test(document.body.innerText || ''));
}

let ok = await loggedIn();
if (!ok) {
  log('🔓 Non risulti loggato: apro il login, fai l\'accesso via VNC…');
  await page.goto(LOGIN_URL).catch(() => {});
  for (let i = 0; i < 100; i++) { await page.waitForTimeout(3000); if (!/login\.24hassistance/i.test(page.url())) { ok = true; break; } }
}

if (!ok) { log('⚠️  Login non rilevato. Collegati via VNC e accedi, poi riavvia il servizio.'); }
else {
  log('✅ LOGGATO. URL:', page.url());
  await ctx.storageState({ path: 'auth.json' });
  await page.screenshot({ path: 'shots/area.png', fullPage: true });
  log('📸 shots/area.png salvato');
  const links = await page.evaluate(() =>
    [...document.querySelectorAll('a,button,[role=button]')]
      .map(e => ({ t: (e.innerText || e.getAttribute('aria-label') || '').replace(/\s+/g,' ').trim().slice(0,45), href: e.getAttribute('href') || null }))
      .filter(x => x.t));
  const rilevanti = links.filter(l => /preventiv|moto|scooter|nuov|quota|veicol|polizz|emett/i.test(l.t));
  log('--- VOCI RILEVANTI (preventivo/moto/…) ---');
  log(JSON.stringify(rilevanti, null, 2));
  log('--- PRIME 50 VOCI DI MENU ---');
  log(JSON.stringify(links.slice(0, 50)));
}

// keep-alive: ogni 4 minuti tocca il portale per non far scadere la sessione
setInterval(async () => {
  try { await page.goto(PORTAL, { waitUntil: 'domcontentloaded', timeout: 45000 }); log('[keep-alive] sessione toccata'); }
  catch (e) { log('[keep-alive] errore:', e.message); }
}, 4 * 60 * 1000);

log('=== SERVIZIO ATTIVO: browser loggato e tenuto vivo. Lascia aperto. ===');
await new Promise(() => {});
