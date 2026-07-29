// ─────────────────────────────────────────────────────────────────────────────
// COLLAUDO QUOTO — suite Playwright
//
// Apre l'app servita da static-server.js (porta 8077) in un Chromium headless,
// con login SIMULATO e Supabase/API FINTI: nessuna chiamata esce verso la
// produzione. Ogni prova è un controllo secco; alla fine si stampa N/N.
//
//   node static-server.js &      # prima: serve il repo sulla 8077
//   node ui-test.mjs             # poi: la suite (richiede: npm i --no-save playwright)
//
// Regola del brief di unificazione: la suite deve restare TUTTA VERDE e non
// devono comparire errori JavaScript in pagina. Ogni fase del lavoro aggiunge
// qui le sue prove.
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8077';

/* ── esiti ─────────────────────────────────────────────────────────────────── */
const esiti = [];
async function prova(nome, fn) {
  try { const m = await fn(); esiti.push([true, nome, m || '']); }
  catch (e) { esiti.push([false, nome, e && e.message || String(e)]); }
}
function deve(c, msg) { if (!c) throw new Error(msg); }

/* ── il finto Supabase (iniettato PRIMA di ogni script della pagina) ───────── */
// La sessione simulata usa l'email del super admin: così si vede l'app completa
// (tutte le voci di navigazione, incluso il pannello Fonti).
function initScript(conSessione) {
  return `
    window.__COLLAUDO = { setSession: 0 };
    (function () {
      var UTENTE = {
        id: '00000000-0000-4000-8000-000000000001',
        email: 'francesco.oddo199307@gmail.com',
        user_metadata: { full_name: 'Collaudo Withus' }
      };
      var SESSIONE = ${conSessione ? `{
        access_token: 'tok-collaudo', refresh_token: 'rtok-collaudo', user: UTENTE
      }` : 'null'};
      var PROFILO = {
        id: UTENTE.id, email: UTENTE.email, nome: 'Collaudo', ruolo: 'admin',
        attivo: true, accesso_quoto: true, accesso_iam: true,
        moduli: null, rete: null, responsabile: true
      };

      // Costruttore di interrogazioni: ogni metodo restituisce ancora il
      // costruttore, e il tutto si può "await-are" come una Promise.
      function builder(tabella) {
        var singolo = false;
        var b = {};
        var metodi = ['select','insert','update','upsert','delete','eq','neq','gt','gte',
          'lt','lte','like','ilike','is','in','or','not','contains','match','filter',
          'order','limit','range','csv','abortSignal','returns','overrideTypes'];
        metodi.forEach(function (m) { b[m] = function () { return b; }; });
        b.single = function () { singolo = true; return b; };
        b.maybeSingle = b.single;
        b.then = function (ok, ko) {
          var r;
          if (singolo) {
            r = (tabella === 'iam_utenti')
              ? { data: PROFILO, error: null }
              : { data: null, error: null };
          } else {
            r = { data: [], error: null, count: 0 };
          }
          return Promise.resolve(r).then(ok, ko);
        };
        b.catch = function (ko) { return b.then(null, ko); };
        return b;
      }

      function canale() {
        var c = {};
        c.on = function () { return c; };
        c.subscribe = function () { return c; };
        c.unsubscribe = function () { return Promise.resolve('ok'); };
        c.send = function () { return Promise.resolve('ok'); };
        return c;
      }

      var client = {
        auth: {
          getSession: function () { return Promise.resolve({ data: { session: SESSIONE }, error: null }); },
          getUser: function () { return Promise.resolve({ data: { user: SESSIONE && SESSIONE.user }, error: null }); },
          setSession: function (s) {
            window.__COLLAUDO.setSession++;
            SESSIONE = { access_token: s.access_token, refresh_token: s.refresh_token, user: UTENTE };
            return Promise.resolve({ data: { session: SESSIONE }, error: null });
          },
          onAuthStateChange: function () {
            return { data: { subscription: { unsubscribe: function () {} } } };
          },
          signInWithPassword: function () { return Promise.resolve({ data: { session: SESSIONE }, error: null }); },
          signOut: function () { SESSIONE = null; return Promise.resolve({ error: null }); },
          resetPasswordForEmail: function () { return Promise.resolve({ data: {}, error: null }); },
          updateUser: function () { return Promise.resolve({ data: {}, error: null }); },
          mfa: {
            listFactors: function () { return Promise.resolve({ data: { all: [], totp: [] }, error: null }); },
            getAuthenticatorAssuranceLevel: function () { return Promise.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null }); },
            enroll: function () { return Promise.resolve({ data: null, error: { message: 'collaudo' } }); },
            challengeAndVerify: function () { return Promise.resolve({ data: {}, error: null }); },
            unenroll: function () { return Promise.resolve({ data: {}, error: null }); }
          }
        },
        from: builder,
        channel: canale,
        removeChannel: function () {},
        rpc: function () { return builder('rpc'); },
        functions: { invoke: function () { return Promise.resolve({ data: {}, error: null }); } },
        storage: {
          from: function () {
            return {
              upload: function () { return Promise.resolve({ data: {}, error: null }); },
              list: function () { return Promise.resolve({ data: [], error: null }); },
              remove: function () { return Promise.resolve({ data: [], error: null }); },
              download: function () { return Promise.resolve({ data: null, error: { message: 'collaudo' } }); },
              getPublicUrl: function () { return { data: { publicUrl: '' } }; },
              createSignedUrl: function () { return Promise.resolve({ data: { signedUrl: '' }, error: null }); }
            };
          }
        }
      };

      window.supabase = { createClient: function () { return client; } };

      // ApexCharts finto: i grafici non servono al collaudo
      window.ApexCharts = function () {};
      window.ApexCharts.prototype.render = function () { return Promise.resolve(); };
      window.ApexCharts.prototype.updateSeries = function () {};
      window.ApexCharts.prototype.updateOptions = function () {};
      window.ApexCharts.prototype.destroy = function () {};

      // niente finestre bloccanti durante il collaudo
      window.alert = function (m) { (window.__COLLAUDO.alerts = window.__COLLAUDO.alerts || []).push(String(m)); };
      window.confirm = function () { return true; };
    })();
  `;
}

/* ── rete finta: nulla esce dal computer ───────────────────────────────────── */
async function bloccaRete(context) {
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(BASE)) return route.continue();      // file locali: veri
    // tutto il resto (CDN, API, Supabase) riceve una risposta finta e innocua
    if (/\.css(\?|$)/.test(url)) return route.fulfill({ status: 200, contentType: 'text/css', body: '/* collaudo */' });
    if (/\.m?js(\?|$)|jsdelivr|unpkg|cdn/.test(url)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* collaudo */' });
    if (/\.(png|jpe?g|gif|svg|ico|woff2?)(\?|$)/.test(url)) return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.alloc(0) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

/* ── raccolta errori JavaScript della pagina ───────────────────────────────── */
function sorvegliaErrori(page, sacco) {
  page.on('pageerror', (e) => sacco.push('pageerror: ' + (e && e.message || e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text() || '';
    if (/Failed to load resource|net::|ERR_/.test(t)) return; // rumore di rete, non errori del codice
    sacco.push('console: ' + t);
  });
}

async function nuovaPagina(browser, { sessione, url }) {
  const context = await browser.newContext();
  await bloccaRete(context);
  const page = await context.newPage();
  await page.addInitScript(initScript(sessione));
  const errori = [];
  sorvegliaErrori(page, errori);
  await page.goto(url, { waitUntil: 'load' });
  return { context, page, errori };
}

/* ═══ le prove ═══════════════════════════════════════════════════════════════ */
const avvio = async () => {
  // 0) il server statico risponde?
  await prova('server statico: index.html servito', async () => {
    const r = await fetch(BASE + '/');
    deve(r.status === 200, 'risposta ' + r.status + ' (lanciare prima: node static-server.js &)');
    const t = await r.text();
    deve(t.includes('id="login-screen"'), 'index.html non contiene la schermata di login');
    return 'HTTP 200';
  });
  await prova('server statico: tipo corretto per i CSS', async () => {
    const r = await fetch(BASE + '/withus-one-skin.css');
    deve(r.status === 200, 'withus-one-skin.css non servito');
    deve((r.headers.get('content-type') || '').includes('text/css'), 'content-type sbagliato');
  });

  let browser;
  try {
    browser = await chromium.launch();
  } catch (e) {
    browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  }

  /* ── A. senza sessione: schermata di accesso ────────────────────────────── */
  {
    const { context, page, errori } = await nuovaPagina(browser, { sessione: false, url: BASE + '/?email=prova%40withus.it' });
    await page.waitForTimeout(600);

    await prova('anonimo: si vede il login, non l\'app', async () => {
      deve(await page.locator('#login-screen').isVisible(), 'login-screen non visibile');
      deve(!(await page.locator('#main-screen').isVisible()), 'main-screen visibile senza sessione');
    });
    await prova('anonimo: email del ponte precompilata (?email=)', async () => {
      deve(await page.inputValue('#l-email') === 'prova@withus.it', 'campo email non precompilato');
    });
    await prova('anonimo: nessun errore JavaScript', async () => {
      deve(errori.length === 0, errori.join(' | '));
    });
    await context.close();
  }

  /* ── B. modalità WITH US ONE (?from=iam) ────────────────────────────────── */
  {
    const { context, page, errori } = await nuovaPagina(browser, { sessione: true, url: BASE + '/?from=iam' });
    await page.waitForTimeout(900);

    await prova('emb-iam: la classe scatta con ?from=iam', async () => {
      deve(await page.evaluate(() => document.documentElement.classList.contains('emb-iam')), 'classe emb-iam assente');
    });
    await prova('emb-iam: la pelle withus-one-skin.css è caricata', async () => {
      const ok = await page.evaluate(() =>
        [...document.styleSheets].some(s => (s.href || '').includes('withus-one-skin.css')));
      deve(ok, 'foglio withus-one-skin.css non presente');
    });
    await prova('emb-iam: la topbar di QUOTO non si vede', async () => {
      const d = await page.evaluate(() => getComputedStyle(document.querySelector('.topbar')).display);
      deve(d === 'none', 'topbar visibile (display: ' + d + ')');
    });
    await prova('emb-iam: nessun errore JavaScript', async () => {
      deve(errori.length === 0, errori.join(' | '));
    });
    await context.close();
  }

  /* ── C. login simulato: l'app si apre ───────────────────────────────────── */
  {
    const { context, page, errori } = await nuovaPagina(browser, { sessione: true, url: BASE + '/' });
    await page.waitForSelector('#main-screen', { state: 'visible', timeout: 8000 });

    await prova('sessione: l\'app si apre senza chiedere il login', async () => {
      deve(await page.locator('#main-screen').isVisible(), 'main-screen non visibile');
      deve(!(await page.locator('#login-screen').isVisible()), 'login-screen ancora visibile');
    });
    await prova('sessione: nome e ruolo dal profilo iam_utenti', async () => {
      deve((await page.textContent('#sb-name')).trim() === 'Collaudo', 'nome sbagliato');
      deve((await page.textContent('#sb-role')).trim() === 'Super Admin', 'ruolo sbagliato');
    });
    await prova('sessione: navigazione completa per il super admin', async () => {
      for (const id of ['nav-home', 'nav-stor', 'nav-emiss', 'nav-rich', 'nav-estratto', 'nav-fonti']) {
        deve(await page.locator('#' + id).isVisible(), id + ' non visibile');
      }
    });

    /* ── D. showPage: ogni pagina risponde ────────────────────────────────── */
    const PAGINE = ['home', 'storico', 'emissioni', 'richieste', 'estratto', 'sinistri',
      'anagrafiche', 'documenti', 'fonti', 'rca', 'persona', 'tutela', 'beni',
      'impresa', 'cvtard', 'cauzioni'];
    for (const p of PAGINE) {
      await prova('showPage("' + p + '") apre la pagina', async () => {
        await page.evaluate((n) => showPage(n), p);
        await page.waitForTimeout(120);
        const attiva = await page.evaluate((n) =>
          document.getElementById('page-' + n)?.classList.contains('active'), p);
        deve(attiva, 'page-' + p + ' non attiva');
      });
    }

    await prova('sessione: nessun errore JavaScript navigando', async () => {
      deve(errori.length === 0, errori.join(' | '));
    });
    await context.close();
  }

  /* ── E. ponte della scocca: ?page=<nome> ────────────────────────────────── */
  {
    const { context, page, errori } = await nuovaPagina(browser, { sessione: true, url: BASE + '/?from=iam&page=storico' });
    await page.waitForSelector('#main-screen', { state: 'visible', timeout: 8000 });
    await page.waitForTimeout(400);

    await prova('ponte ?page=storico: la scocca apre la pagina giusta', async () => {
      deve(await page.evaluate(() => document.getElementById('page-storico').classList.contains('active')),
        'page-storico non attiva dopo il ponte');
    });
    await prova('ponte: nessun errore JavaScript', async () => {
      deve(errori.length === 0, errori.join(' | '));
    });
    await context.close();
  }

  /* ── F. ponte sessione IAM → QUOTO (#at/#rt) ────────────────────────────── */
  {
    const { context, page, errori } = await nuovaPagina(browser, { sessione: false, url: BASE + '/?from=iam#at=tok-ponte&rt=rtok-ponte' });
    await page.waitForTimeout(900);

    await prova('ponte #at/#rt: la sessione viene ripristinata', async () => {
      deve(await page.evaluate(() => window.__COLLAUDO.setSession) === 1, 'setSession non chiamato una volta');
    });
    await prova('ponte #at/#rt: i token spariscono dall\'indirizzo', async () => {
      deve(await page.evaluate(() => window.location.hash) === '', 'hash ancora presente');
    });
    await prova('ponte #at/#rt: nessun errore JavaScript', async () => {
      deve(errori.length === 0, errori.join(' | '));
    });
    await context.close();
  }

  await browser.close();
};

/* ── esecuzione e riepilogo ────────────────────────────────────────────────── */
avvio().then(() => {
  let ok = 0;
  for (const [passata, nome, msg] of esiti) {
    if (passata) { ok++; console.log('  ✅ ' + nome + (msg ? '  — ' + msg : '')); }
    else { console.log('  ❌ ' + nome + '  — ' + msg); }
  }
  console.log('\n' + (ok === esiti.length ? '🟢' : '🔴') + ' Collaudo QUOTO: ' + ok + '/' + esiti.length + ' prove superate');
  process.exit(ok === esiti.length ? 0 : 1);
}).catch((e) => {
  console.error('Collaudo interrotto:', e);
  process.exit(1);
});
