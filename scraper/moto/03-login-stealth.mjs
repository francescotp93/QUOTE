// ── Tappa 2b: login con "stealth" (anti-rilevamento bot) ───────────────────────
// Eseguire con schermo virtuale:  xvfb-run -a node 03-login-stealth.mjs
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
chromium.use(stealth());

const LOGIN_URL = 'https://login.24hassistance.com/?ReturnUrl=https://www.24hassistance.com';

function loadEnv(path) {
  try { for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  } } catch {}
}
loadEnv(new URL('./.env', import.meta.url).pathname);
const USER = process.env.H24_USERNAME, PASS = process.env.H24_PASSWORD;
if (!USER || !PASS) { console.error('❌ Mancano H24_USERNAME / H24_PASSWORD in .env'); process.exit(1); }
const log = (...a) => console.log(...a);

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox','--disable-blink-features=AutomationControlled'] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'it-IT' });
  const page = await ctx.newPage();

  log('→ Apro il login (stealth, schermo virtuale)…');
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);

  try { await page.locator('button:has-text("Accetta")').first().click({ timeout: 5000 }); log('🍪 Cookie accettati'); await page.waitForTimeout(800); }
  catch { log('🍪 Nessun banner cookie'); }

  // digito "come un umano" (con piccoli ritardi)
  await page.locator('#Input_Username').click();
  await page.locator('#Input_Username').type(USER, { delay: 90 });
  await page.locator('#Input_Password').click();
  await page.locator('#Input_Password').type(PASS, { delay: 90 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'shots/02-prima-submit.png', fullPage: true });

  try { await page.click('button[type=submit]', { timeout: 5000 }); log('↩️  submit cliccato'); }
  catch { await page.locator('#Input_Password').press('Enter'); log('↩️  Invio'); }

  await page.waitForLoadState('networkidle', { timeout: 35000 }).catch(() => {});
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'shots/03-dopo-login.png', fullPage: true });

  const url = page.url();
  log('—\nURL dopo login:', url, '\nTitolo:', await page.title());
  const body = (await page.evaluate(() => document.body.innerText || '')).replace(/\n{2,}/g, '\n');
  const hint = body.match(/verifica di sicurezza[^\n]*|non superata[^\n]*|credenzial[^\n]*|errat[^\n]*/i);
  log('Indizio esito:', hint ? hint[0] : '(nessun messaggio d\'errore evidente)');

  if (!/login\.24hassistance/i.test(url)) {
    await ctx.storageState({ path: 'auth.json' });
    log('✅ LOGIN RIUSCITO — sessione salvata in auth.json');
  } else {
    log('⚠️  Ancora sul login (vedi shots/03-dopo-login.png). Se è il reCAPTCHA, passiamo alla Strategia B.');
  }
  await browser.close();
  log('✓ Fatto.');
})().catch(e => { console.error('ERRORE FATALE:', e); process.exit(1); });
