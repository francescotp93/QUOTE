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
import fs from 'fs';

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

  /* ── prove statiche sul pacchetto "dominio unico su VPS" ────────────────── */
  // Stesso elenco della prova indirizzo-unico.test.mjs del repo IAM: se i due
  // elenchi divergono, un percorso chiamato dal preventivatore finirebbe su
  // IAM e risponderebbe 404.
  const PERCORSI_SERVIZIO = [
    'auth', 'backup', 'catalogo', 'crm', 'diag', 'firma-collab', 'fonti',
    'l', 'lead', 'login', 'mail', 'moto', 'notify', 'pay', 'preventivi',
    'products', 'public', 'scrape', 'shop', 'sign', 'user',
  ];
  const NGINX_CONF = 'deploy/nginx/iam.withusassicurazioni.it.conf';

  await prova('dominio unico: la config nginx copre tutti i percorsi di servizio', async () => {
    const conf = fs.readFileSync(NGINX_CONF, 'utf8');
    const riga = (conf.match(/location ~ \^\/\(([^)]+)\)/) || [])[1];
    deve(riga, 'manca il blocco dei servizi (location ~ ^/(...))');
    const coperti = riga.split('|');
    const mancanti = PERCORSI_SERVIZIO.filter(p => !coperti.includes(p));
    deve(mancanti.length === 0, 'percorsi dimenticati: ' + mancanti.join(', '));
    return coperti.length + ' percorsi verso il backend';
  });
  await prova('dominio unico: /nuovo-preventivo/ serve la facciata QUOTO', async () => {
    const conf = fs.readFileSync(NGINX_CONF, 'utf8');
    deve(conf.includes('location /nuovo-preventivo/'), 'manca la location /nuovo-preventivo/');
    deve(conf.includes('alias /opt/withus-quoto/'), 'la facciata QUOTO non punta a /opt/withus-quoto');
    deve(/location \/api\/[\s\S]*?proxy_pass https:\/\/quote-ten-mu\.vercel\.app/.test(conf), '/api non va alla funzione Vercel');
  });
  await prova('dominio unico: le intestazioni di sicurezza restano', async () => {
    const conf = fs.readFileSync(NGINX_CONF, 'utf8');
    deve(conf.includes('X-Content-Type-Options nosniff'), 'manca nosniff');
    deve(conf.includes('X-Frame-Options SAMEORIGIN'), 'manca SAMEORIGIN');
  });
  await prova('autopull: le config nginx si applicano con prova e rollback', async () => {
    const sh = fs.readFileSync('deploy/autopull.sh', 'utf8');
    deve(sh.includes('deploy/nginx/*.conf'), 'autopull non guarda deploy/nginx');
    deve(sh.includes('nginx -t'), 'manca il controllo nginx -t prima del reload');
    deve(sh.includes('ROLLBACK'), 'manca il rollback su config non valida');
    deve(sh.includes('deploy/setup.d/*.sh'), 'autopull non esegue gli script di primo impianto');
  });
  await prova('primo impianto: guardie su porte occupate e DNS prima di certbot', async () => {
    const sh = fs.readFileSync('deploy/setup.d/10-dominio-unico.sh', 'utf8');
    deve(sh.includes('occupata_da_altri'), 'manca la guardia sulle porte 80/443');
    const iDns = sh.indexOf('getent ahostsv4');
    const iCert = sh.indexOf('certbot --nginx');
    deve(iDns > 0 && iCert > iDns, 'certbot non aspetta che il DNS punti al VPS');
    deve(sh.includes('51.254.142.199'), 'manca l\'IP del VPS per il controllo DNS');
  });

  /* ── prove statiche sui token grafici condivisi (Fase 2, punto 1) ───────── */
  await prova('token: la fonte unica definisce i valori del marchio', async () => {
    const t = fs.readFileSync('withus-one-tokens.css', 'utf8');
    for (const [nome, valore] of [['--w1-verde', '#02984e'], ['--w1-raggio', '4px'],
      ['--w1-bordo', '#dde3e9'], ['--w1-testo-base', '13px'], ['--w1-verde-scuro', '#016b38']]) {
      deve(new RegExp(nome.replace(/-/g, '\\-') + '\\s*:\\s*' + valore).test(t), nome + ' non vale ' + valore);
    }
  });
  await prova('token: la pelle legge i token, niente valori a mano nel blocco variabili', async () => {
    const s = fs.readFileSync('withus-one-skin.css', 'utf8');
    const blocco = (s.match(/html\.emb-iam\{[\s\S]*?\}/) || [''])[0];
    deve(blocco.includes('var(--w1-'), 'il blocco variabili non usa i token');
    deve(!/#[0-9a-fA-F]{3,8}/.test(blocco), 'il blocco variabili contiene ancora colori scritti a mano');
    deve((s.match(/var\(--w1-/g) || []).length >= 12, 'meno riferimenti ai token del previsto');
  });
  /* ── prove statiche: dentro il nuovo sistema non si legge più "QUOTO" ───── */
  await prova('marchio: nessuna briciola dice più QUOTO', async () => {
    const h = fs.readFileSync('index.html', 'utf8');
    const rimaste = (h.match(/QUOTO <span>\/<\/span>/g) || []).length;
    deve(rimaste === 0, rimaste + ' briciole dicono ancora QUOTO');
    deve((h.match(/With Us One <span>\/<\/span>/g) || []).length >= 15, 'briciole With Us One mancanti');
  });
  await prova('marchio: titolo della pagina e documenti stampati', async () => {
    const h = fs.readFileSync('index.html', 'utf8');
    deve(/<title>With Us One/.test(h), 'il titolo della pagina dice ancora QUOTO');
    deve(!h.includes('generato da QUOTO'), 'un documento stampato dice ancora "generato da QUOTO"');
    deve(!h.includes('generato automaticamente da QUOTO'), 'estratto conto ancora marchiato QUOTO');
    deve(!h.includes('<div class="brand">QUOTO'), 'intestazione di stampa ancora QUOTO');
    deve((h.match(/generato (?:automaticamente )?da With Us One/g) || []).length >= 3, 'piè di pagina With Us One mancanti');
  });

  await prova('token: index.html carica i token PRIMA della pelle', async () => {
    const h = fs.readFileSync('index.html', 'utf8');
    const iTok = h.indexOf('withus-one-tokens.css');
    const iSkin = h.indexOf('withus-one-skin.css');
    deve(iTok > 0, 'withus-one-tokens.css non caricato');
    deve(iSkin > iTok, 'la pelle è caricata prima dei token (le variabili sarebbero vuote)');
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
    await prova('emb-iam: le briciole del preventivo dicono With Us One', async () => {
      await page.evaluate(() => showPage('auto'));
      await page.waitForTimeout(150);
      const t = await page.evaluate(() => (document.querySelector('#page-auto .aw-crumb') || {}).textContent || '');
      deve(t.includes('With Us One'), 'briciola senza With Us One: "' + t.trim().slice(0, 60) + '"');
      deve(!t.includes('QUOTO'), 'la briciola dice ancora QUOTO');
    });
    await prova('emb-iam: i token arrivano davvero alla pagina (catena viva)', async () => {
      const v = await page.evaluate(() => ({
        verde: getComputedStyle(document.documentElement).getPropertyValue('--blue').trim(),
        corpo: getComputedStyle(document.body).fontSize,
        fondo: getComputedStyle(document.body).backgroundColor,
      }));
      deve(v.verde === '#02984e', '--blue non risolve al verde With Us (vale: "' + v.verde + '")');
      deve(v.corpo === '13px', 'corpo del testo non a 13px (vale: ' + v.corpo + ')');
      deve(v.fondo === 'rgb(238, 241, 244)', 'fondo pagina non dal token (vale: ' + v.fondo + ')');
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
