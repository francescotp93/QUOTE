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
      // Registro delle operazioni e risposte su misura: servono per collaudare
      // la scrittura (es. la creazione della polizza all'emissione) senza un
      // database vero. Dai test: window.__COLLAUDO.risposte['quote_polizze:single'] = …
      window.__COLLAUDO.db = [];
      window.__COLLAUDO.risposte = {};

      function builder(tabella) {
        var singolo = false, operazione = 'select', payload = null, filtri = {};
        var b = {};
        var passanti = ['select','upsert','delete','neq','gt','gte','lt','lte','like',
          'ilike','is','in','or','not','contains','match','filter','order','limit',
          'range','csv','abortSignal','returns','overrideTypes'];
        passanti.forEach(function (m) { b[m] = function () { return b; }; });
        b.eq = function (col, val) { filtri[col] = val; return b; };
        b.insert = function (v) { operazione = 'insert'; payload = v; annota(); return b; };
        b.update = function (v) { operazione = 'update'; payload = v; annota(); return b; };
        b.single = function () { singolo = true; return b; };
        b.maybeSingle = b.single;

        function annota() {
          window.__COLLAUDO.db.push({
            tabella: tabella, operazione: operazione,
            payload: JSON.parse(JSON.stringify(payload || null)),
            filtri: JSON.parse(JSON.stringify(filtri))
          });
        }

        b.then = function (ok, ko) {
          var chiave = tabella + ':' + (singolo ? 'single' : 'lista');
          var su_misura = window.__COLLAUDO.risposte[chiave];
          if (su_misura !== undefined) {
            return Promise.resolve(JSON.parse(JSON.stringify(su_misura))).then(ok, ko);
          }
          var r;
          if (operazione === 'insert') {
            r = { data: singolo ? { id: 'nuovo-' + tabella, numero: 1 } : [], error: null };
          } else if (singolo) {
            r = (tabella === 'iam_utenti') ? { data: PROFILO, error: null }
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

      window.supabase = { createClient: function (u, k, opts) {
        window.__COLLAUDO.clientOpts = opts || null;
        return client;
      } };

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

  /* ── prove statiche sul Punto 1 del CRM ─────────────────────────────────── */
  await prova('polizze: la vista dello scadenzario non scavalca la riservatezza', async () => {
    // Una vista è per difetto SECURITY DEFINER: leggerebbe con i permessi di chi
    // l'ha creata e ogni utente vedrebbe le polizze di tutti. Falla vera,
    // introdotta e corretta il 29/07/2026: questa prova impedisce che rientri.
    const sql = fs.readFileSync('supabase/quote_polizze.sql', 'utf8');
    const iVista = sql.indexOf('create or replace view public.quote_scadenzario');
    const iInvoker = sql.indexOf('security_invoker = true');
    deve(iVista > 0, 'la vista quote_scadenzario non è nel file');
    deve(iInvoker > iVista, 'manca security_invoker dopo la creazione della vista');
  });
  await prova('polizze: RLS e politiche su tutte le tabelle nuove', async () => {
    const sql = fs.readFileSync('supabase/quote_polizze.sql', 'utf8');
    for (const t of ['quote_polizze', 'quote_titoli', 'quote_pratica_documenti']) {
      deve(new RegExp('alter table public\\.' + t + '\\s+enable row level security').test(sql),
        'RLS non attivata su ' + t);
    }
    // si riusano le funzioni già in uso, non se ne inventano di nuove
    for (const f of ['quote_vede(', 'iam_is_staff()', 'iam_is_admin()']) {
      deve(sql.includes(f), 'politiche non allineate alle altre tabelle: manca ' + f);
    }
    deve((sql.match(/create policy/g) || []).length >= 12, 'meno politiche del previsto');
  });
  await prova('polizze: ogni emissione crea la polizza', async () => {
    // Tre punti nel codice segnano una polizza come emessa: se uno dimentica di
    // creare l'entità, quella polizza non esisterà mai nel portafoglio.
    const h = fs.readFileSync('index.html', 'utf8');
    const segnano = (h.match(/polizza_emessa\s*[:=]\s*true/g) || []).length;
    const creano = (h.match(/creaPolizzaDaPreventivo\(/g) || []).length;
    deve(segnano >= 3, 'meno punti di emissione del previsto: ' + segnano);
    // 1 dichiarazione + almeno un richiamo per ogni punto di emissione
    deve(creano >= segnano + 1, segnano + ' punti segnano l\'emissione ma solo ' + (creano - 1) + ' creano la polizza');
    return segnano + ' punti di emissione coperti';
  });
  await prova('polizze: le colonne storiche restano (niente rotture)', async () => {
    const h = fs.readFileSync('index.html', 'utf8');
    const sql = fs.readFileSync('supabase/quote_polizze.sql', 'utf8');
    deve(h.includes('polizza_emessa'), 'polizza_emessa non è più scritta: il codice esistente si rompe');
    deve(!/alter table[^;]*quote_preventivi[^;]*drop/i.test(sql), 'la migrazione tocca quote_preventivi');
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
    const PAGINE = ['home', 'portafoglio', 'storico', 'emissioni', 'richieste', 'estratto', 'sinistri',
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

    /* ── CRM Punto 1: la polizza è un'entità ─────────────────────────────── */
    await prova('polizza: l\'emissione crea la riga in quote_polizze', async () => {
      const esito = await page.evaluate(async () => {
        window.__COLLAUDO.db = [];
        window.__COLLAUDO.risposte = {
          'quote_polizze:single': { data: null, error: null },   // nessuna polizza esistente
          'quote_preventivi:single': { error: null, data: {
            id: 'prev-1', modulo: 'persona', prodotto: 'RC Vita Privata', compagnia: 'HDI',
            premio: 144, cliente_id: null, prodotto_id: null,
            creato_da: 'agente-1', creato_nome: 'Mario',
            dati: { clienteId: 'cli-1', dataEffetto: '2026-07-01', frazionamento: 'Mensile', premio_mensile: 12 }
          } }
        };
        await window.creaPolizzaDaPreventivo('prev-1');
        return window.__COLLAUDO.db.filter(o => o.tabella === 'quote_polizze' && o.operazione === 'insert');
      });
      deve(esito.length >= 1, 'nessun inserimento in quote_polizze');
      const p = esito[0].payload;
      deve(p.preventivo_id === 'prev-1', 'preventivo_id non collegato');
      deve(p.cliente_id === 'cli-1', 'cliente_id non recuperato da dati.clienteId (vale: ' + p.cliente_id + ')');
      deve(p.data_effetto === '2026-07-01', 'data_effetto sbagliata: ' + p.data_effetto);
      deve(p.premio_annuo === 144, 'premio_annuo sbagliato: ' + p.premio_annuo);
      deve(p.premio_rata === 12, 'premio_rata non preso dal mensile: ' + p.premio_rata);
      deve(p.frazionamento === 'Mensile', 'frazionamento perso');
      deve(p.creato_da === 'agente-1', 'la polizza non resta intestata all\'autore del preventivo');
      return 'campi corretti';
    });

    await prova('polizza: la scadenza si calcola dalla durata del prodotto', async () => {
      const p = await page.evaluate(async () => {
        window.__COLLAUDO.db = [];
        window.__COLLAUDO.risposte = {
          'quote_polizze:single': { data: null, error: null },
          'quote_preventivi:single': { error: null, data: {
            id: 'prev-2', prodotto: 'Casa', premio: 300, prodotto_id: 'cat-1',
            creato_da: 'agente-1', dati: { dataEffetto: '2026-01-31' }
          } },
          'quote_prodotti_catalogo:single': { error: null, data: { durata_mesi: 12 } }
        };
        await window.creaPolizzaDaPreventivo('prev-2');
        return window.__COLLAUDO.db.filter(o => o.tabella === 'quote_polizze' && o.operazione === 'insert')[0].payload;
      });
      deve(p.data_scadenza === '2027-01-31', 'scadenza sbagliata: ' + p.data_scadenza);
      deve(p.tacito_rinnovo === true, 'con una scadenza il tacito rinnovo dovrebbe essere attivo');
    });

    await prova('polizza: i mesi si sommano senza slittare di giorni', async () => {
      // 31 gennaio + 1 mese = 28 febbraio, non il 3 marzo. Su una polizza due
      // giorni di errore sono un rinnovo perso.
      const c = await page.evaluate(() => ({
        feb:   window.sommaMesi('2026-01-31', 1),
        bis:   window.sommaMesi('2028-01-31', 1),
        anno:  window.sommaMesi('2026-06-20', 12),
        sei:   window.sommaMesi('2026-10-15', 6),
        dieci: window.sommaMesi('2026-03-01', 120)
      }));
      deve(c.feb === '2026-02-28', 'gen+1 mese: ' + c.feb);
      deve(c.bis === '2028-02-29', 'anno bisestile: ' + c.bis);
      deve(c.anno === '2027-06-20', 'un anno: ' + c.anno);
      deve(c.sei === '2027-04-15', 'sei mesi a cavallo d\'anno: ' + c.sei);
      deve(c.dieci === '2036-03-01', 'dieci anni: ' + c.dieci);
      return 'cinque casi, anno bisestile incluso';
    });

    await prova('polizza: senza durata la scadenza resta vuota', async () => {
      const p = await page.evaluate(async () => {
        window.__COLLAUDO.db = [];
        window.__COLLAUDO.risposte['quote_polizze:single'] = { data: null, error: null };
        window.__COLLAUDO.risposte['quote_prodotti_catalogo:single'] = { error: null, data: { durata_mesi: null } };
        await window.creaPolizzaDaPreventivo('prev-2');
        return window.__COLLAUDO.db.filter(o => o.tabella === 'quote_polizze' && o.operazione === 'insert')[0].payload;
      });
      deve(p.data_scadenza === null, 'ha inventato una scadenza per un prodotto senza durata: ' + p.data_scadenza);
      deve(p.tacito_rinnovo === false, 'tacito rinnovo attivo senza scadenza');
    });

    await prova('polizza: senza prodotto collegato la scadenza resta vuota', async () => {
      // Regola 2 del §4: un dato ufficiale che manca resta vuoto, non stimato.
      // Qui il preventivo non ha nemmeno prodotto_id: non c'è da dove ricavarla.
      const p = await page.evaluate(async () => {
        window.__COLLAUDO.db = [];
        window.__COLLAUDO.risposte = {
          'quote_polizze:single': { data: null, error: null },
          'quote_preventivi:single': { error: null, data: {
            id: 'prev-3', prodotto: 'Sconosciuto', premio: 100, prodotto_id: null,
            creato_da: 'agente-1', dati: { dataEffetto: '2026-07-01' }
          } }
        };
        await window.creaPolizzaDaPreventivo('prev-3');
        return window.__COLLAUDO.db.filter(o => o.tabella === 'quote_polizze' && o.operazione === 'insert')[0].payload;
      });
      deve(p.data_scadenza === null, 'data_scadenza è stata indovinata: ' + p.data_scadenza);
    });

    await prova('polizza: non si creano doppioni (idempotente)', async () => {
      const n = await page.evaluate(async () => {
        window.__COLLAUDO.db = [];
        window.__COLLAUDO.risposte['quote_polizze:single'] = { data: { id: 'pol-esistente' }, error: null };
        await window.creaPolizzaDaPreventivo('prev-1');
        return window.__COLLAUDO.db.filter(o => o.tabella === 'quote_polizze' && o.operazione === 'insert').length;
      });
      deve(n === 0, 'ha inserito un doppione pur esistendo già la polizza');
    });

    await prova('polizza: un errore non fa perdere l\'emissione', async () => {
      const r = await page.evaluate(async () => {
        window.__COLLAUDO.risposte['quote_polizze:single'] = { data: null, error: { message: 'tabella assente' } };
        window.__COLLAUDO.risposte['quote_preventivi:single'] = { data: null, error: { message: 'giù' } };
        try { return { esito: await window.creaPolizzaDaPreventivo('prev-1'), eccezione: false }; }
        catch (e) { return { esito: null, eccezione: true }; }
      });
      deve(!r.eccezione, 'l\'errore è uscito e avrebbe interrotto l\'emissione');
      deve(r.esito === null, 'dovrebbe restituire null quando non riesce');
    });

    await prova('polizza: la spia segnala la scadenza mancante', async () => {
      const s = await page.evaluate(() => ({
        mancante: window.pillolaScadenza({ __polizza: { data_scadenza: null } }),
        vicina:   window.pillolaScadenza({ __polizza: { data_scadenza: new Date(Date.now() + 20 * 86400000).toISOString().slice(0,10) } }),
        scaduta:  window.pillolaScadenza({ __polizza: { data_scadenza: '2020-01-01' } }),
        lontana:  window.pillolaScadenza({ __polizza: { data_scadenza: new Date(Date.now() + 300 * 86400000).toISOString().slice(0,10) } }),
        senza:    window.pillolaScadenza({ __polizza: null })
      }));
      deve(/scadenza da confermare/.test(s.mancante), 'nessuna spia sulla scadenza mancante');
      deve(/scade tra 20gg|scade tra 19gg|scade tra 21gg/.test(s.vicina), 'nessun avviso di scadenza vicina: ' + s.vicina);
      deve(/scaduta/.test(s.scaduta) && /st-scad/.test(s.scaduta), 'la polizza scaduta non è segnalata in rosso');
      deve(s.lontana === '' && s.senza === '', 'la spia compare quando non deve');
      return 'quattro casi distinti';
    });

    /* ── CRM Punto 2: portafoglio e cruscotto a semafori ─────────────────── */
    // Tre polizze finte che coprono i casi che contano: una a posto, una senza
    // scadenza, una scaduta e non perfezionata.
    const POLIZZE_FINTE = [
      { id: 'p1', numero: 1, numero_polizza: 'HDI/123', cliente: 'Rossi Mario', modulo: 'persona',
        prodotto: 'RC Vita Privata', compagnia: 'HDI', data_effetto: '2026-06-20',
        data_scadenza: '2027-06-20', frazionamento: 'Mensile', premio_annuo: 144, premio_rata: 12,
        stato_pagamento: 'pagato', perfezionata: true, rendicontata: true, creato_nome: 'Anna', preventivo_id: 'prev-1' },
      { id: 'p2', numero: 2, numero_polizza: null, cliente: 'Bianchi Srl', modulo: 'beni',
        prodotto: 'Rischi Catastrofali', compagnia: 'HDI', data_effetto: '2026-07-01',
        data_scadenza: null, frazionamento: 'Annuale', premio_annuo: 60, premio_rata: 60,
        stato_pagamento: 'non_pagato', perfezionata: false, rendicontata: false, creato_nome: 'Anna', preventivo_id: null },
      { id: 'p3', numero: 3, numero_polizza: 'AXA/999', cliente: 'Verdi Luca', modulo: 'rca',
        prodotto: 'RC Auto', compagnia: 'AXA', data_effetto: '2024-01-01',
        data_scadenza: '2025-01-01', frazionamento: 'Annuale', premio_annuo: 500, premio_rata: 500,
        stato_pagamento: 'sospeso', perfezionata: false, rendicontata: false, creato_nome: 'Luigi', preventivo_id: 'prev-3' }
    ];

    await prova('portafoglio: la pagina esiste e il menu della scocca ora la trova', async () => {
      // Tre voci del menu WITH US ONE puntavano a ?page=portafoglio da prima
      // che la pagina esistesse: non apriva nulla.
      const ok = await page.evaluate(() => !!document.getElementById('page-portafoglio'));
      deve(ok, 'page-portafoglio non esiste');
      await page.evaluate(() => showPage('portafoglio'));
      await page.waitForTimeout(150);
      deve(await page.evaluate(() => document.getElementById('page-portafoglio').classList.contains('active')),
        'la pagina non si attiva');
      deve(await page.evaluate(() => document.getElementById('nav-portafoglio').classList.contains('active')),
        'la voce di navigazione non si evidenzia');
    });

    // Si passa dal percorso vero: la finta risposta del database entra in
    // loadPortafoglio(), che filtra, riempie i menu e disegna. Così si collauda
    // la catena completa e non solo la funzione di disegno.
    await page.evaluate(async (finte) => {
      window.__COLLAUDO.risposte['quote_polizze:lista'] = { data: finte, error: null };
      await window.loadPortafoglio();
    }, POLIZZE_FINTE);

    await prova('portafoglio: quattro semafori per riga, ognuno con la sua spiegazione', async () => {
      const r = await page.evaluate(() => {
        const righe = [...document.querySelectorAll('#pf-body tr')].filter(t => t.querySelector('.pf-sems'));
        const primi = [...righe[0].querySelectorAll('.sem')].map(s => s.getAttribute('title'));
        return { righe: righe.length, semPerRiga: primi.length, titoli: primi,
                 senzaTitolo: [...document.querySelectorAll('#pf-body .sem')].filter(s => !s.getAttribute('title')).length };
      });
      deve(r.righe === 3, 'righe disegnate: ' + r.righe);
      deve(r.semPerRiga === 4, 'semafori per riga: ' + r.semPerRiga);
      deve(r.senzaTitolo === 0, r.senzaTitolo + ' pallini senza spiegazione (il colore da solo non è informazione)');
      deve(/Pagamento/.test(r.titoli[0]) && /Perfezionamento/.test(r.titoli[1])
        && /Rendicontazione/.test(r.titoli[2]) && /Copertura/.test(r.titoli[3]),
        'i quattro fronti non sono nell\'ordine dichiarato dalla legenda: ' + r.titoli.join(' / '));
      return r.titoli[0] + ' … ' + r.titoli[3];
    });

    await prova('portafoglio: la legenda spiega tutti i colori usati', async () => {
      const l = await page.evaluate(() => {
        const leg = document.querySelector('#page-portafoglio .pf-legenda');
        const classi = new Set([...document.querySelectorAll('#pf-body .sem')]
          .flatMap(s => [...s.classList]).filter(c => c !== 'sem'));
        const spiegate = new Set([...leg.querySelectorAll('.sem')].flatMap(s => [...s.classList]).filter(c => c !== 'sem'));
        return { usate: [...classi], spiegate: [...spiegate], testo: leg.textContent };
      });
      const nonSpiegate = l.usate.filter(c => !l.spiegate.includes(c));
      deve(nonSpiegate.length === 0, 'colori usati ma non in legenda: ' + nonSpiegate.join(', '));
      deve(/Pagamento/.test(l.testo) && /Copertura/.test(l.testo), 'legenda incompleta');
    });

    await prova('portafoglio: il tasto di esportazione è un tasto, non una fascia', async () => {
      // .btn-inf è la classe dei bottoni a piena larghezza dei form: riusarla
      // qui riempiva la pagina di verde da un bordo all'altro.
      const m = await page.evaluate(() => {
        const b = document.querySelector('#page-portafoglio .pf-exp');
        const p = document.querySelector('#page-portafoglio .pf-top');
        return { b: b.getBoundingClientRect().width, p: p.getBoundingClientRect().width,
                 classi: b.className };
      });
      deve(!/btn-inf/.test(m.classi), 'usa ancora .btn-inf (width:100%)');
      deve(m.b < m.p * 0.5, 'il tasto occupa ' + Math.round(m.b / m.p * 100) + '% della barra');
      return Math.round(m.b) + 'px su ' + Math.round(m.p) + 'px';
    });

    await prova('portafoglio: la copertura si deduce dalle date', async () => {
      const oggi = new Date().toISOString().slice(0, 10);
      const fra30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      const c = await page.evaluate((d) => ({
        attiva:   window.pfCopertura({ data_effetto: '2020-01-01', data_scadenza: d.fra30 }),
        futura:   window.pfCopertura({ data_effetto: d.fra30, data_scadenza: '2099-01-01' }),
        finita:   window.pfCopertura({ data_effetto: '2020-01-01', data_scadenza: '2021-01-01' }),
        senzaFin: window.pfCopertura({ data_effetto: '2020-01-01', data_scadenza: null }),
        senzaDat: window.pfCopertura({ data_effetto: null, data_scadenza: null })
      }), { oggi, fra30 });
      deve(c.attiva[0] === 'sem-ok', 'copertura in corso non verde: ' + c.attiva[0]);
      deve(c.futura[0] === 'sem-att', 'copertura futura non in attesa: ' + c.futura[0]);
      deve(c.finita[0] === 'sem-no', 'copertura terminata non spenta: ' + c.finita[0]);
      deve(c.senzaFin[0] === 'sem-att' && /da confermare/.test(c.senzaFin[1]), 'copertura senza fine mal gestita');
      deve(c.senzaDat[0] === 'sem-no', 'copertura senza date mal gestita');
      return 'cinque casi';
    });

    await prova('portafoglio: la scadenza mancante e quella passata si vedono', async () => {
      const t = await page.evaluate(() => document.getElementById('pf-body').textContent);
      deve(/da confermare/.test(t), 'la polizza senza scadenza non è segnalata');
      deve(/scaduta/.test(t), 'la polizza scaduta non è segnalata');
      deve(/numero di compagnia da inserire/.test(t), 'non si vede quale polizza è senza numero di compagnia');
    });

    await prova('portafoglio: i filtri restringono e i totali seguono', async () => {
      const r = await page.evaluate(() => {
        // si contano le righe VERE (quelle con i semafori): la riga di
        // "nessun risultato" non è una polizza
        const conta = () => [...document.querySelectorAll('#pf-body tr')].filter(t => t.querySelector('.pf-sems')).length;
        const metti = (id, v) => { document.getElementById(id).value = v; window.pfRender(); };
        const out = {};
        metti('pf-compagnia', 'HDI');
        out.hdi = conta(); out.totHdi = document.getElementById('pf-totali').textContent;
        metti('pf-compagnia', ''); metti('pf-stato', 'pagato');
        out.pagate = conta();
        metti('pf-stato', ''); metti('pf-cliente', 'bianchi');
        out.cliente = conta();
        metti('pf-cliente', ''); metti('pf-numero', 'axa');
        out.numero = conta();
        metti('pf-numero', ''); metti('pf-da', '2026-01-01');
        out.dal2026 = conta();
        window.pfAzzera();
        out.dopoAzzera = conta();
        return out;
      });
      deve(r.hdi === 2, 'filtro compagnia: ' + r.hdi + ' invece di 2');
      deve(/204,00/.test(r.totHdi), 'i totali non seguono il filtro: ' + r.totHdi);
      deve(r.pagate === 1, 'filtro stato: ' + r.pagate);
      deve(r.cliente === 1, 'filtro cliente (senza distinzione maiuscole): ' + r.cliente);
      deve(r.numero === 1, 'filtro numero di polizza: ' + r.numero);
      deve(r.dal2026 === 2, 'filtro data effetto: ' + r.dal2026);
      deve(r.dopoAzzera === 3, 'Azzera non ripristina tutto: ' + r.dopoAzzera);
      return 'sei filtri + azzera';
    });

    await prova('portafoglio: i totali dicono cosa manca', async () => {
      const t = await page.evaluate(() => { window.pfRender(); return document.getElementById('pf-totali').textContent; });
      deve(/3\s*polizze/.test(t), 'conteggio assente: ' + t);
      deve(/704,00/.test(t), 'somma dei premi sbagliata: ' + t);
      deve(/2 da perfezionare/.test(t), 'non dice quante sono da perfezionare: ' + t);
      deve(/1 senza data di scadenza/.test(t), 'non dice quante sono senza scadenza: ' + t);
    });

    await prova('portafoglio: il numero di polizza ripiega su un progressivo leggibile', async () => {
      const n = await page.evaluate(() => ({
        conNumero: window.pfNumero({ numero_polizza: 'HDI/123', numero: 7, data_effetto: '2026-06-20' }),
        senza:     window.pfNumero({ numero_polizza: null, numero: 7, data_effetto: '2026-06-20' })
      }));
      deve(n.conNumero === 'HDI/123', 'il numero di compagnia deve vincere: ' + n.conNumero);
      deve(n.senza === 'PL-2026-0007', 'progressivo di ripiego sbagliato: ' + n.senza);
    });

    /* ── CRM Punto 4: scadenzario e rinnovi ──────────────────────────────── */
    const gg = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
    const SCADENZE_FINTE = [
      // scaduta e non riquotata: il caso che fa perdere soldi
      { id: 's1', numero: 1, numero_polizza: 'AXA/1', cliente: 'Verdi Luca', modulo: 'rca',
        prodotto: 'RC Auto', compagnia: 'AXA', data_scadenza: gg(-15), premio_annuo: 500,
        tacito_rinnovo: false, sostituzioni: 0, giorni_alla_scadenza: -15, creato_nome: 'Luigi', preventivo_id: 'prev-a' },
      // urgente, ancora da lavorare
      { id: 's2', numero: 2, numero_polizza: 'HDI/2', cliente: 'Rossi Mario', modulo: 'persona',
        prodotto: 'RC Vita Privata', compagnia: 'HDI', data_scadenza: gg(12), premio_annuo: 144,
        tacito_rinnovo: false, sostituzioni: 0, giorni_alla_scadenza: 12, creato_nome: 'Anna', preventivo_id: 'prev-b' },
      // già riquotata: non va richiamata
      { id: 's3', numero: 3, numero_polizza: 'HDI/3', cliente: 'Bianchi Srl', modulo: 'beni',
        prodotto: 'Rischi Catastrofali', compagnia: 'HDI', data_scadenza: gg(45), premio_annuo: 60,
        tacito_rinnovo: false, sostituzioni: 1, giorni_alla_scadenza: 45, creato_nome: 'Anna', preventivo_id: null },
      // tacito rinnovo: si rinnova da sé ma va verificata
      { id: 's4', numero: 4, numero_polizza: 'GRP/4', cliente: 'Costruzioni Alfa', modulo: 'impresa',
        prodotto: 'Multirischio impresa', compagnia: 'Groupama', data_scadenza: gg(80), premio_annuo: 2400,
        tacito_rinnovo: true, sostituzioni: 0, giorni_alla_scadenza: 80, creato_nome: 'Luigi', preventivo_id: null },
      // fuori fascia (oltre 90 giorni)
      { id: 's5', numero: 5, numero_polizza: 'HDI/5', cliente: 'Neri Spa', modulo: 'beni',
        prodotto: 'Casa', compagnia: 'HDI', data_scadenza: gg(200), premio_annuo: 300,
        tacito_rinnovo: false, sostituzioni: 0, giorni_alla_scadenza: 200, creato_nome: 'Anna', preventivo_id: null }
    ];

    await page.evaluate(async (finte) => {
      window.__COLLAUDO.risposte['quote_scadenzario:lista'] = { data: finte, error: null };
      showPage('scadenzario');
      await window.loadScadenzario();
    }, SCADENZE_FINTE);

    await prova('scadenzario: la pagina esiste e la scocca ora la trova', async () => {
      deve(await page.evaluate(() => !!document.getElementById('page-scadenzario')), 'page-scadenzario non esiste');
      deve(await page.evaluate(() => document.getElementById('page-scadenzario').classList.contains('active')),
        'la pagina non si attiva');
      deve(await page.evaluate(() => document.getElementById('nav-scadenzario').classList.contains('active')),
        'la voce di navigazione non si evidenzia');
    });

    await prova('scadenzario: le fasce di urgenza contano giusto', async () => {
      const f = await page.evaluate(() => [...document.querySelectorAll('#rin-fasce .rin-fascia')]
        .map(b => ({ n: b.querySelector('b').textContent, l: b.querySelector('span').textContent })));
      const per = l => Number(f.find(x => x.l === l)?.n);
      deve(f.length === 5, 'fasce presenti: ' + f.length);
      deve(per('Scadute') === 1, 'scadute: ' + per('Scadute'));
      deve(per('Entro 30 gg') === 1, 'entro 30: ' + per('Entro 30 gg'));
      deve(per('Entro 60 gg') === 2, 'entro 60 (deve includere i 30): ' + per('Entro 60 gg'));
      deve(per('Entro 90 gg') === 3, 'entro 90: ' + per('Entro 90 gg'));
      deve(per('Tutte') === 5, 'tutte: ' + per('Tutte'));
      return 'cinque fasce cumulative';
    });

    await prova('scadenzario: si vede se il rinnovo è già stato lavorato', async () => {
      // È la colonna che distingue uno strumento da un elenco di date.
      const r = await page.evaluate(() => {
        document.getElementById('rin-stato').value = ''; window.rinFasciaScegli('tutte');
        return [...document.querySelectorAll('#rin-body tr')].map(t => t.textContent.replace(/\s+/g, ' ').trim());
      });
      deve(r.some(t => /Verdi Luca/.test(t) && /Da lavorare/.test(t)), 'la scaduta non è segnata da lavorare');
      deve(r.some(t => /Bianchi/.test(t) && /Riquotata/.test(t)), 'la già riquotata non è riconosciuta');
      deve(r.some(t => /Costruzioni Alfa/.test(t) && /Tacito rinnovo/.test(t)), 'il tacito rinnovo non è distinto');
    });

    await prova('scadenzario: l\'urgenza si legge a colpo d\'occhio', async () => {
      const t = await page.evaluate(() => document.getElementById('rin-body').textContent);
      deve(/scaduta da 15 gg/.test(t), 'non dice da quanto è scaduta: ' + t.slice(0, 120));
      deve(/fra 12 gg/.test(t), 'non dice fra quanto scade');
      const rosso = await page.evaluate(() => !!document.querySelector('#rin-body .st-scad'));
      deve(rosso, 'la scaduta non è in rosso');
    });

    await prova('scadenzario: filtri e ordinamento per scadenza', async () => {
      const r = await page.evaluate(() => {
        const conta = () => [...document.querySelectorAll('#rin-body tr')].filter(t => t.querySelector('td')).length;
        const out = {};
        window.rinFasciaScegli('tutte');
        out.ordine = [...document.querySelectorAll('#rin-body tr td:first-child strong')].map(e => e.textContent);
        document.getElementById('rin-stato').value = 'lavorato'; window.rinRender();
        out.lavorate = conta();
        document.getElementById('rin-stato').value = 'da_lavorare'; window.rinRender();
        out.daFare = conta();
        document.getElementById('rin-stato').value = ''; document.getElementById('rin-tacito').value = 'si'; window.rinRender();
        out.tacite = conta();
        document.getElementById('rin-tacito').value = ''; document.getElementById('rin-cliente').value = 'neri'; window.rinRender();
        out.cliente = conta();
        window.rinAzzera();
        out.dopoAzzera = conta();
        return out;
      });
      // la data in italiano gg/mm/aaaa: si confronta ribaltandola
      const iso = s => s.split('/').reverse().join('-');
      const ordinate = [...r.ordine].sort((a, b) => iso(a).localeCompare(iso(b)));
      deve(JSON.stringify(r.ordine) === JSON.stringify(ordinate), 'non è ordinato per scadenza: ' + r.ordine.join(', '));
      deve(r.lavorate === 1, 'filtro già riquotate: ' + r.lavorate);
      deve(r.daFare === 4, 'filtro da lavorare: ' + r.daFare);
      deve(r.tacite === 1, 'filtro tacito rinnovo: ' + r.tacite);
      deve(r.cliente === 1, 'filtro cliente: ' + r.cliente);
      deve(r.dopoAzzera === 5, 'Azzera non ripristina tutto: ' + r.dopoAzzera);
      return 'ordinamento + quattro filtri';
    });

    await prova('scadenzario: le polizze senza scadenza non ci entrano', async () => {
      // Stanno nel portafoglio con la spia "da confermare": qui creerebbero
      // solo rumore, perché non si può rinnovare ciò che non scade.
      const n = await page.evaluate(async () => {
        window.__COLLAUDO.risposte['quote_scadenzario:lista'] = { data: [
          { id: 'x1', cliente: 'Senza Scadenza', modulo: 'beni', prodotto: 'X', data_scadenza: null, giorni_alla_scadenza: null, sostituzioni: 0 }
        ], error: null };
        await window.loadScadenzario();
        return [...document.querySelectorAll('#rin-body tr')].filter(t => /Senza Scadenza/.test(t.textContent)).length;
      });
      deve(n === 0, 'una polizza senza scadenza è finita nello scadenzario');
    });

    await prova('scadenzario: il numero sulla voce di menu avvisa da solo', async () => {
      const b = await page.evaluate(async (finte) => {
        window.__COLLAUDO.risposte['quote_scadenzario:lista'] = { data: finte, error: null };
        await window.loadScadenzario();
        const e = document.getElementById('scad-badge');
        return { testo: e.textContent, visibile: e.style.display !== 'none' };
      }, SCADENZE_FINTE);
      // entro 60 giorni: la scaduta, quella a 12 e quella a 45
      deve(b.testo === '3', 'conteggio avviso sbagliato: ' + b.testo);
      deve(b.visibile, 'l\'avviso non si vede');
      return b.testo + ' entro 60 giorni';
    });

    await prova('scadenzario: i totali dicono quanto vale il rinnovo', async () => {
      const t = await page.evaluate(() => { window.rinFasciaScegli('tutte'); return document.getElementById('rin-totali').textContent; });
      deve(/5\s*scadenze/.test(t), 'conteggio assente: ' + t);
      deve(/3\.404,00/.test(t), 'somma dei premi in rinnovo sbagliata: ' + t);
      deve(/4 da lavorare/.test(t), 'non dice quante da lavorare: ' + t);
    });

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

  /* ── E-bis. OSPITE: dentro il riquadro della scocca ─────────────────────── */
  // Il bug del 29/07/2026: il riquadro riproponeva il login. Causa (log auth
  // Supabase): il preventivatore rinnovava la sessione per conto suo, il
  // refresh token ruotava, IAM restava con quello vecchio → "already used" →
  // Supabase revocava tutta la sessione. Dentro il riquadro deve stare OSPITE.
  {
    const context = await browser.newContext();
    await bloccaRete(context);
    const page = await context.newPage();
    await page.addInitScript(initScript(false));
    const errori = [];
    sorvegliaErrori(page, errori);
    await page.setContent(
      '<iframe id="q" style="width:1000px;height:700px;border:0" ' +
      'src="' + BASE + '/?from=iam&page=storico#at=tok-ponte&rt=rtok-ponte"></iframe>');
    const frame = await (await page.waitForSelector('#q')).contentFrame();
    await frame.waitForSelector('#main-screen', { state: 'visible', timeout: 8000 });
    await page.waitForTimeout(400);

    await prova('ospite: dentro il riquadro non si salva né si rinnova la sessione', async () => {
      const o = await frame.evaluate(() => window.__COLLAUDO.clientOpts);
      deve(o && o.auth, 'il preventivatore si comporta ancora da padrone della sessione');
      deve(o.auth.persistSession === false, 'persistSession non disattivato');
      deve(o.auth.autoRefreshToken === false, 'autoRefreshToken non disattivato (è la causa del logout)');
    });
    await prova('ospite: l\'app si apre, nessun login riproposto', async () => {
      deve(await frame.locator('#main-screen').isVisible(), 'app non aperta dentro il riquadro');
      deve(!(await frame.locator('#login-screen').isVisible()), 'il riquadro ripropone il login (bug rientrato)');
      deve(await frame.evaluate(() => document.getElementById('page-storico').classList.contains('active')),
        'la pagina chiesta dalla scocca non si è aperta');
    });
    await prova('ospite: il magazzino negato non ferma l\'accesso', async () => {
      // Nel riquadro cross-dominio il browser NEGA sessionStorage: la rete di
      // sicurezza deve metterne uno in memoria, altrimenti onLogin muore.
      const s = await frame.evaluate(() => {
        try {
          sessionStorage.setItem('__prova__', 'x');
          const v = sessionStorage.getItem('__prova__');
          sessionStorage.removeItem('__prova__');
          return { ok: true, v };
        } catch (e) { return { ok: false, err: String(e.message || e) }; }
      });
      deve(s.ok, 'sessionStorage solleva ancora un errore: ' + s.err);
      deve(s.v === 'x', 'il magazzino in memoria non restituisce quello che scrive');
    });
    await prova('ospite: nessun errore JavaScript', async () => {
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
