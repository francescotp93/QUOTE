// ── Tappa 2: login su 24hAssistance (Moto Platinum) ────────────────────────────
// Credenziali: file  scraper/moto/.env  con  H24_USERNAME=...  e  H24_PASSWORD=...
// Uso: node 02-login.mjs
import { chromium } from 'playwright';
import fs from 'fs';

const LOGIN_URL = 'https://login.24hassistance.com/?ReturnUrl=https://www.24hassistance.com';

// mini-loader del file .env (niente dipendenze)
function loadEnv(path) {
  try {
    for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
}
loadEnv(new URL('./.env', import.meta.url).pathname);

const USER = process.env.H24_USERNAME;
const PASS = process.env.H24_PASSWORD;
if (!USER || !PASS) {
  console.error('❌ Mancano H24_USERNAME / H24_PASSWORD nel file .env (scraper/moto/.env)');
  process.exit(1);
}

const log = (...a) => console.log(...a);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 900 },
    locale: 'it-IT',
  });
  const page = await ctx.newPage();

  log('→ Apro la pagina di login…');
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);

  // 1) Banner cookie (se c'è)
  try {
    await page.locator('button:has-text("Accetta")').first().click({ timeout: 5000 });
    log('🍪 Cookie accettati');
    await page.waitForTimeout(800);
  } catch { log('🍪 Nessun banner cookie (o già chiuso)'); }

  // 2) Compilo utente e password
  await page.fill('#Input_Username', USER);
  await page.fill('#Input_Password', PASS);
  await page.screenshot({ path: 'shots/02-prima-submit.png', fullPage: true });
  log('✍️  Campi compilati (screenshot 02-prima-submit.png)');

  // 3) Invio il form (provo il bottone submit, poi fallback Invio)
  try {
    await page.click('button[type=submit]', { timeout: 5000 });
    log('↩️  Cliccato pulsante submit');
  } catch {
    log('↩️  Nessun submit trovato, premo Invio sulla password');
    await page.locator('#Input_Password').press('Enter');
  }

  // 4) Aspetto l'esito
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3500);
  await page.screenshot({ path: 'shots/03-dopo-login.png', fullPage: true });

  const url = page.url();
  log('—');
  log('URL dopo login:', url);
  log('Titolo:        ', await page.title());
  const bodyText = (await page.evaluate(() => document.body.innerText || '')).replace(/\n{2,}/g, '\n').slice(0, 700);
  log('--- TESTO PAGINA (estratto) ---');
  log(bodyText);
  log('-------------------------------');

  const stillOnLogin = /login\.24hassistance/i.test(url);
  if (!stillOnLogin) {
    await ctx.storageState({ path: 'auth.json' });
    log('✅ Login riuscito (pare): sessione salvata in auth.json');
  } else {
    log('⚠️  Sembra ancora sulla pagina di login — guarda shots/03-dopo-login.png (errore credenziali o reCAPTCHA?)');
  }

  await browser.close();
  log('✓ Fatto.');
})().catch(e => { console.error('ERRORE FATALE:', e); process.exit(1); });
