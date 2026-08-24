// ---------------------------------------------------------------------
// Gestione sessione Prima Intermediari.
//
// IL PROBLEMA: il portale usa Auth0 con MFA obbligatoria (codice TOTP da
// app di autenticazione). Nessuno scraper puo' generare quel codice.
//
// LA SOLUZIONE: la checkbox "Ricorda questo dispositivo per 30 giorni"
// fa salvare ad Auth0 un cookie di device trust. Con quel cookie nel
// profilo persistente, i login successivi con sola email+password NON
// richiedono piu' l'OTP, per 30 giorni.
//
// Flusso operativo:
//   1. `npm run login`  -> una volta ogni 30 giorni, in interattivo:
//                          un umano inserisce l'OTP, noi spuntiamo
//                          "ricorda dispositivo" e salviamo lo stato.
//   2. `npm run scrape` -> usa lo stato salvato; se e' scaduto tenta un
//                          re-login automatico headless; se il portale
//                          richiede di nuovo l'OTP esce con codice 2
//                          (stato "auth_required") invece di bloccarsi.
// ---------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { PRIMA, STATE_FILE, ROOT, log } from './config.js';
import { AuthRequiredError } from './client.js';

const PROFILE_DIR = path.join(ROOT, 'storage', 'profile');

const SEL = {
  email: 'input[type="text"], input[name="username"], input[type="email"]',
  password: 'input[type="password"]',
  submit: 'button[type="submit"]',
  otp: 'input[name="code"], input[autocomplete="one-time-code"], input[inputmode="numeric"]',
  rememberDevice: 'input[type="checkbox"]',
};

/**
 * @param {object} opts
 * @param {boolean} opts.interactive  true = attende che un umano digiti l'OTP
 */
export async function login({ interactive = false } = {}) {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: interactive ? false : PRIMA.headless,
    viewport: { width: 1400, height: 900 },
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
  });

  const page = ctx.pages()[0] || (await ctx.newPage());

  try {
    log('Apro il portale…');
    await page.goto(PRIMA.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    // Gia' loggati grazie al profilo persistente?
    if (!/login/i.test(page.url())) {
      log('Sessione gia' + "'" + ' attiva, nessun login necessario.');
      return await persist(ctx);
    }

    if (!PRIMA.email || !PRIMA.password) {
      throw new AuthRequiredError('PRIMA_EMAIL / PRIMA_PASSWORD mancanti nel .env');
    }

    log('Compilo le credenziali…');
    await page.fill(SEL.email, PRIMA.email);
    await page.fill(SEL.password, PRIMA.password);
    await Promise.all([
      page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {}),
      page.click(SEL.submit),
    ]);
    await page.waitForTimeout(4000);

    // --- Secondo fattore ------------------------------------------------
    const otpField = page.locator(SEL.otp).first();
    if (await otpField.count().then((c) => c > 0).catch(() => false)) {
      // Spuntiamo SEMPRE "ricorda questo dispositivo": e' cio' che permette
      // alle esecuzioni successive di saltare l'MFA.
      const remember = page.locator(SEL.rememberDevice).first();
      if (await remember.count()) {
        await remember.check({ timeout: 5000 }).catch(() => {});
        log('Spuntato "Ricorda questo dispositivo per 30 giorni".');
      }

      if (!interactive) {
        throw new AuthRequiredError(
          'Il portale richiede il codice OTP: il device trust e\' scaduto. ' +
          'Serve una esecuzione interattiva: npm run login'
        );
      }

      log('');
      log('  >>> INSERISCI IL CODICE OTP NELLA FINESTRA DEL BROWSER <<<');
      log('      (hai 5 minuti; la checkbox "ricorda dispositivo" e\' gia\' spuntata)');
      log('');
      await page.waitForURL((u) => !/login/i.test(u.toString()), { timeout: 300000 });
    }

    await page.waitForTimeout(3000);
    if (/login/i.test(page.url())) {
      throw new AuthRequiredError(`Login non completato, sono ancora su ${page.url()}`);
    }

    log('Login riuscito.');
    return await persist(ctx);
  } finally {
    await ctx.close().catch(() => {});
  }
}

async function persist(ctx) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const state = await ctx.storageState({ path: STATE_FILE });
  log(`Sessione salvata in ${STATE_FILE} (${state.cookies.length} cookie).`);
  return state;
}

// Eseguito direttamente: `npm run login`
if (import.meta.url === `file://${process.argv[1]}`) {
  login({ interactive: true })
    .then(() => { log('Fatto. Ora puoi lanciare: npm run scrape'); process.exit(0); })
    .catch((e) => { console.error('LOGIN FALLITO:', e.message); process.exit(1); });
}
