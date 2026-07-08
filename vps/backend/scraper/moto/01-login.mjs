// ── Tappa 1: apri la pagina di login, fotografala, elenca i campi ───────────────
// Uso: node 01-login.mjs   (nessuna credenziale necessaria in questa tappa)
import { chromium } from 'playwright';

const LOGIN_URL = 'https://login.24hassistance.com/?ReturnUrl=https://www.24hassistance.com';

const log = (...a) => console.log(...a);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 900 },
    locale: 'it-IT',
  });
  const page = await ctx.newPage();

  log('→ Apro:', LOGIN_URL);
  try {
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 60000 });
  } catch (e) {
    log('⚠️  goto ha dato timeout/errore, continuo comunque:', e.message);
  }
  await page.waitForTimeout(2500);

  await page.screenshot({ path: 'shots/01-login.png', fullPage: true });
  log('📸 Screenshot salvato: shots/01-login.png');
  log('   Titolo pagina:', await page.title());
  log('   URL finale:   ', page.url());

  // Elenco compatto di tutti i campi/pulsanti utili a capire il form
  const fields = await page.evaluate(() => {
    const clean = s => (s || '').replace(/\s+/g, ' ').trim().slice(0, 50) || null;
    const sel = 'input,select,textarea,button,a[role=button],[type=submit]';
    return [...document.querySelectorAll(sel)].map(el => ({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || null,
      name: el.getAttribute('name') || null,
      id: el.id || null,
      placeholder: el.getAttribute('placeholder') || null,
      aria: el.getAttribute('aria-label') || null,
      text: clean(el.innerText || el.value),
    }));
  });
  log('--- CAMPI / PULSANTI TROVATI ---');
  log(JSON.stringify(fields, null, 2));

  // Conta i frame (a volte il login è dentro un iframe)
  log('--- FRAME nella pagina ---');
  for (const f of page.frames()) log('  frame:', f.url());

  await browser.close();
  log('✓ Fatto.');
})().catch(e => { console.error('ERRORE FATALE:', e); process.exit(1); });
