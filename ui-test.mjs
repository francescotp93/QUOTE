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
    /* Sentinella del LAMPO: da qui in avanti, a ogni fotogramma, annota se la
       schermata di accesso e' stata visibile anche solo per un istante. Serve a
       dimostrare che dentro il riquadro di IAM non compare MAI prima che la
       sessione del ponte #at/#rt sia stata ripristinata (bug del 26/08/2026). */
    window.__LOGIN_VISTO = false;
    (function guardaLampo() {
      var l = document.getElementById('login-screen');
      if (l && l.offsetParent !== null) window.__LOGIN_VISTO = true;
      requestAnimationFrame(guardaLampo);
    })();
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
    deve(t.includes('id="boot-screen"'), 'index.html non contiene il velo di avvio');
    deve(/#login-screen\{display:none/.test(t),
      'la schermata di accesso nasce visibile: dentro il riquadro di IAM lampeggia');
    deve(t.includes('id="aw-premio-box" style="display:none"'),
      'le righe del confronto nascono visibili: una compagnia disattivata si vede prima di sparire');
    deve(t.includes('function awBloccoInterruttori'),
      'manca il blocco fail-closed sugli interruttori delle Fonti');
    return 'HTTP 200';
  });
  await prova('server statico: tipo corretto per i CSS', async () => {
    const r = await fetch(BASE + '/withus-one-skin.css');
    deve(r.status === 200, 'withus-one-skin.css non servito');
    deve((r.headers.get('content-type') || '').includes('text/css'), 'content-type sbagliato');
  });

  /* ── niente collegamenti simbolici nel ramo pubblicato ─────────────────── */
  // Il 02/08/2026 un collegamento `node_modules` -> /home/user/QUOTE/node_modules
  // e' finito nel commit dell'unificazione ed e' arrivato su main. GitHub Pages
  // pubblica da main: un collegamento che punta FUORI dal repository fa fallire
  // la ricostruzione, e il sito resta fermo alla versione precedente senza che
  // niente dica perche'. Il sito e' rimasto vecchio per venti minuti.
  //
  // .gitignore diceva `node_modules/` con la barra finale, che vale per una
  // cartella e non per un collegamento: per questo era passato.
  await prova('pubblicazione: nessun collegamento simbolico nel ramo', async () => {
    const { execSync } = await import('child_process');
    const righe = execSync('git ls-tree -r HEAD', { encoding: 'utf8' }).split('\n');
    const link = righe.filter(r => r.startsWith('120000')).map(r => r.split('\t')[1]);
    deve(link.length === 0,
      'collegamenti simbolici nel ramo: ' + link.join(', ') + ' — GitHub Pages non ricostruisce piu\'');
    return righe.length - 1 + ' file, nessun collegamento';
  });

  /* ── il pacchetto "dominio unico su VPS" è PARCHEGGIATO ──────────────────── */
  // Qui c'erano cinque prove che sorvegliavano il pacchetto del dominio unico:
  // deploy/nginx/*.conf e deploy/setup.d/10-dominio-unico.sh.
  //
  // Il 02/08/2026, unificando i rami, quel pacchetto è stato tolto dal ramo
  // vivo. Non perché sia sbagliato: perché 10-dominio-unico.sh installa nginx e
  // certbot e si ritenta ogni minuto finché non riesce, e aspetta ancora il
  // record DNS su Aruba. Farlo salire su una macchina in produzione dentro
  // un'unificazione di rami sarebbe un cambiamento che nessuno ha chiesto.
  //
  // Il pacchetto NON è perduto: vive per intero su
  // backup/main-2026-08-02-pre-unificazione, e si rimette quando il DNS si
  // sposta davvero, come scelta consapevole e con il suo collaudo.
  //
  // Questa prova ha preso il posto di quelle cinque e sorveglia il parcheggio:
  // se qualcuno rimettesse dentro lo script che si autoinstalla senza volerlo,
  // diventerebbe rossa. Cancellare le prove e basta avrebbe tolto la copertura
  // in silenzio.
  await prova('dominio unico: il pacchetto resta parcheggiato, non torna da solo', async () => {
    const daNonAvere = ['deploy/setup.d/10-dominio-unico.sh', 'deploy/nginx'];
    const tornati = daNonAvere.filter(p => fs.existsSync(p));
    deve(tornati.length === 0,
      'è rientrato nel ramo: ' + tornati.join(', ') + '. Se è voluto, rimettere anche le sue prove.');
    const sh = fs.readFileSync('deploy/autopull.sh', 'utf8');
    deve(!sh.includes('deploy/nginx/*.conf'),
      'autopull applica di nuovo configurazioni nginx: il pacchetto è tornato a metà');
    deve(sh.includes('deploy/setup.d/*.sh'),
      'il meccanismo degli script di primo impianto è sparito del tutto: serve ancora per la chiave SSH');
    return 'parcheggiato su backup/main-2026-08-02-pre-unificazione';
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
    deve((h.match(/IAM <span>\/<\/span>/g) || []).length >= 15, 'briciole IAM mancanti');
    /* «With Us One» è un nome ritirato (IAM.md §2): indicava tre cose diverse —
       la barra, una riscrittura non pubblicata e l'intera piattaforma. Qui si
       sorveglia che non rientri da nessuna parte, nemmeno in un commento. */
    deve(!/With Us One/i.test(h), 'è ricomparso il nome ritirato «With Us One»');
  });
  await prova('marchio: titolo della pagina e documenti stampati', async () => {
    const h = fs.readFileSync('index.html', 'utf8');
    deve(/<title>IAM/.test(h), 'il titolo della pagina non dice IAM');
    deve(!h.includes('generato da QUOTO'), 'un documento stampato dice ancora "generato da QUOTO"');
    deve(!h.includes('generato automaticamente da QUOTO'), 'estratto conto ancora marchiato QUOTO');
    deve(!h.includes('<div class="brand">QUOTO'), 'intestazione di stampa ancora QUOTO');
    deve((h.match(/generato (?:automaticamente )?da (?:With Us Assicurazioni|IAM)/g) || []).length >= 3, 'piè di pagina non marchiati');
    /* Sui documenti che riceve il CLIENTE si legge il nome dell'agenzia, non
       quello del sistema: a chi riceve un preventivo «IAM» non dice niente, e
       mettercelo espone il nome di uno strumento invece di quello di chi lo
       assicura. Scelta dell'utente, 4/8/2026. Il marchio vale sia come nome
       scritto sia come LOGO With Us (il confronto preventivi usa il logo, con
       alt="With Us Assicurazioni" e ripiego al testo — richiesta del 27/8/2026). */
    const marchioTesto = (h.match(/<div class="brand">With Us Assicurazioni/g) || []).length;
    const marchioLogo  = (h.match(/<div class="brand"><img[^>]*withus-logo[^>]*alt="With Us Assicurazioni"/g) || []).length;
    deve(marchioTesto + marchioLogo >= 2, 'documenti al cliente senza il marchio dell\'agenzia');
    deve(!/<div class="brand">IAM/.test(h), 'un documento al cliente è marchiato IAM invece che With Us Assicurazioni');
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
      // Non e' piu' immediato: compare quando getSession() dice "nessuna sessione".
      await page.waitForSelector('#login-screen', { state: 'visible', timeout: 8000 });
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

  /* ── B. modalità IAM (?from=iam) ────────────────────────────────── */
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
    await prova('emb-iam: le briciole del preventivo dicono IAM', async () => {
      await page.evaluate(() => showPage('auto'));
      await page.waitForTimeout(150);
      const t = await page.evaluate(() => (document.querySelector('#page-auto .aw-crumb') || {}).textContent || '');
      deve(t.includes('IAM'), 'briciola senza IAM: "' + t.trim().slice(0, 60) + '"');
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
    await prova('sessione: nessun lampo della schermata di accesso', async () => {
      deve(!(await page.evaluate(() => window.__LOGIN_VISTO)),
        'la schermata di accesso e\' comparsa prima che la sessione fosse pronta');
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
      'anagrafiche', 'utility', 'fonti', 'rca', 'persona', 'tutela', 'beni',
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
    await prova('compat: showPage("documenti") apre ancora Utility', async () => {
      // Vecchie scorciatoie e il canale IAM mandano ancora «documenti»: deve aprire Utility.
      await page.evaluate(() => showPage('documenti'));
      await page.waitForTimeout(120);
      const attiva = await page.evaluate(() => document.getElementById('page-utility')?.classList.contains('active'));
      deve(attiva, 'l\'alias documenti→utility non apre page-utility');
    });

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
      // Tre voci del menu IAM puntavano a ?page=portafoglio da prima
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

    /* ── Blocco E: sinistro strutturato ──────────────────────────────────── */
    await prova('sinistro: controparti e partite sono elenchi, non campi', async () => {
      const r = await page.evaluate(async () => {
        document.getElementById('sin-controparti')?.remove();
        document.getElementById('sin-partite')?.remove();
        document.body.insertAdjacentHTML('beforeend',
          '<div id="sin-controparti"></div><div id="sin-partite"></div>');
        window.__COLLAUDO.risposte['quote_sinistro_controparti:lista'] = { data: [
          { id: 'c1', tipo: 'veicolo', nominativo: 'Bianchi Luca', targa: 'AB123CD', compagnia: 'AXA', responsabilita: 'controparte' },
          { id: 'c2', tipo: 'persona', nominativo: 'Verdi Anna', responsabilita: 'da_definire' },
          { id: 'c3', tipo: 'azienda', nominativo: 'Trasporti Rossi Srl', responsabilita: 'concorsuale' }
        ], error: null };
        window.__COLLAUDO.risposte['quote_sinistro_partite:lista'] = { data: [
          { id: 'p1', tipo: 'veicolo', descrizione: 'Paraurti', importo_richiesto: 1200, importo_liquidato: 900, stato: 'liquidata' },
          { id: 'p2', tipo: 'lesioni', descrizione: 'Colpo di frusta', importo_richiesto: 3000, stato: 'in_perizia' },
          { id: 'p3', tipo: 'cose', descrizione: 'Guardrail', importo_richiesto: 800, stato: 'aperta' }
        ], error: null };
        await window.sinCaricaDettagli('s1');
        return {
          cp: document.querySelectorAll('#sin-controparti .cl-row').length,
          pt: document.querySelectorAll('#sin-partite .cl-row').length,
          testoCp: document.getElementById('sin-controparti').textContent.replace(/\s+/g, ' '),
          testoPt: document.getElementById('sin-partite').textContent.replace(/\s+/g, ' ')
        };
      });
      deve(r.cp === 3, 'controparti disegnate: ' + r.cp + ' (un tamponamento a catena ne ha diverse)');
      deve(r.pt === 3, 'partite disegnate: ' + r.pt);
      deve(/Bianchi Luca/.test(r.testoCp) && /AB123CD/.test(r.testoCp), 'i dati della controparte non si vedono');
      deve(/Della controparte/.test(r.testoCp) && /Concorsuale/.test(r.testoCp), 'la responsabilità non è leggibile');
      deve(/Lesioni/.test(r.testoPt) && /In perizia/.test(r.testoPt), 'tipo e stato della partita non si vedono');
      return '3 controparti, 3 partite';
    });

    await prova('sinistro: i totali si sommano, non si digitano', async () => {
      const t = await page.evaluate(() => document.querySelector('#sin-partite .pf-totali').textContent.replace(/\s+/g, ' '));
      deve(/3 partite/.test(t), 'conteggio partite assente: ' + t);
      deve(/richiesto .*5\.000,00/.test(t), 'somma dei richiesti sbagliata (1200+3000+800): ' + t);
      deve(/liquidato .*900,00/.test(t), 'somma dei liquidati sbagliata: ' + t);
      deve(/2 ancora da chiudere/.test(t), 'non dice quante restano aperte: ' + t);
      return 'richiesto 5.000 · liquidato 900 · 2 aperte';
    });

    await prova('sinistro: un importo che non si sa resta vuoto, non zero', async () => {
      // zero vorrebbe dire "non chiede niente", che è un'altra cosa
      const h = fs.readFileSync('index.html', 'utf8');
      const f = (h.match(/async function sinNuovaPartita[\s\S]*?\n\}/) || [''])[0];
      deve(/importo_richiesto: n/.test(f), 'non passa l\'importo come valore separato');
      deve(/richiesto\.trim\(\) !== '' \? Number/.test(f), 'un campo vuoto non diventa nullo');
      deve(/non si mette zero/.test(f), 'manca la spiegazione della scelta');
    });

    await prova('sinistro: i campi vecchi restano, niente si rompe', async () => {
      const h = fs.readFileSync('index.html', 'utf8');
      deve(/row\('Controparte', s\.controparte\)/.test(h), 'il campo controparte è sparito dalla scheda');
      deve(/s\.danni_persone\?'a persone'/.test(h), 'le caselle dei danni sono sparite');
    });

    await prova('sinistro: se le tabelle non rispondono lo dice, non resta appeso', async () => {
      const t = await page.evaluate(async () => {
        window.__COLLAUDO.risposte['quote_sinistro_controparti:lista'] = { data: null, error: { message: 'giù' } };
        await window.sinCaricaDettagli('s1');
        return document.getElementById('sin-controparti').textContent;
      });
      deve(/Non disponibile/.test(t), 'resta in caricamento: ' + t.slice(0, 60));
    });

    /* ── Blocco E: una sola coda di ticket ───────────────────────────────── */
    await prova('ticket: una coda sola, non due', async () => {
      const h = fs.readFileSync('index.html', 'utf8');
      deve(!/from\('quote_ticket'\)/.test(h), 'il preventivatore scrive ancora sulla vecchia coda');
      deve((h.match(/from\('iam_ticket'\)/g) || []).length >= 5, 'non tutte le operazioni sono passate alla coda unica');
      deve(/origine: 'quoto'/.test(h), 'i ticket aperti dal preventivatore non dichiarano da dove vengono');
      const i = fs.readFileSync('/workspace/agente-sospesi/index.html', 'utf8');
      deve(!/from\('quote_ticket'\)/.test(i), 'IAM tocca la vecchia coda');
      return 'un solo archivio';
    });

    await prova('ticket: la vista di lavoro è identica nelle due facce', async () => {
      // Lo stesso utente deve vedere le stesse cose in QUOTO e in IAM: due
      // filtri diversi sullo stesso archivio sarebbero peggio di due archivi.
      const h = fs.readFileSync('index.html', 'utf8');
      const i = fs.readFileSync('/workspace/agente-sospesi/index.html', 'utf8');
      deve(/currentUser\.role !== 'admin'\) q = q\.eq\('segnalato_da', currentUser\.id\)/.test(h),
        'il preventivatore non filtra come IAM');
      deve(/ruolo !== 'admin'\)[\s\S]{0,60}eq\('segnalato_da'/.test(i), 'IAM non filtra come prima');
    });

    /* ── Blocco D: campagne ──────────────────────────────────────────────── */
    await prova('campagne: la chiave di Brevo non entra mai nel browser', async () => {
      // index.html è pubblico: chiunque apra il sito lo legge. Se la chiave
      // finisse là, chiunque potrebbe inviare email a nome dell'agenzia.
      const h = fs.readFileSync('index.html', 'utf8');
      deve(!/BREVO_API_KEY|api\.brevo\.com|'api-key'/.test(h),
        'la pagina parla direttamente con Brevo o contiene la chiave');
      deve(/PAY_API \+ '\/marketing'/.test(h), 'non passa dal backend');
      const s = fs.readFileSync('server/marketing.js', 'utf8');
      deve(/process\.env\.BREVO_API_KEY/.test(s), 'il server non legge la chiave dal suo ambiente');
      return 'chiave solo lato server';
    });

    await prova('campagne: si crea sempre una bozza, mai un invio', async () => {
      const s = fs.readFileSync('server/marketing.js', 'utf8');
      const crea = (s.match(/marketingRouter\.post\('\/campagna',[\s\S]*?\n\}\);/) || [''])[0];
      deve(crea, 'la creazione non si trova');
      // si guarda il CODICE, non i commenti: la parola scheduledAt compare
      // proprio nel commento che spiega perché non c'è
      const codice = crea.split('\n').filter(r => !/^\s*(\/\/|\/\*|\*)/.test(r)).join('\n');
      deve(!/sendNow|scheduledAt/.test(codice), 'la creazione può far partire un invio');
      deve(/nessuno scheduledAt/.test(crea), 'manca la dichiarazione che la campagna nasce ferma');
    });

    await prova('campagne: l\'invio ha tre serrature', async () => {
      const s = fs.readFileSync('server/marketing.js', 'utf8');
      const inv = (s.match(/marketingRouter\.post\('\/campagna\/:id\/invia',[\s\S]*?\n\}\);/) || [''])[0];
      // 1. conferma testuale esatta
      deve(/conferma !== 'INVIA'/.test(inv), 'manca la conferma testuale');
      // 2. il numero dei destinatari deve corrispondere a quello vero
      deve(/destinatari_attesi/.test(inv) && /attesi !== veri/.test(inv),
        'il server non ricontrolla quanti sono davvero i destinatari');
      // 3. solo chi ha il ruolo
      deve(/puoInviare\(req\.user\.id\)/.test(inv), 'chiunque autenticato potrebbe inviare');
      // e non si reinvia una campagna già partita
      deve(/status === 'sent'/.test(inv), 'una campagna già inviata si potrebbe reinviare');
      return 'conferma + conteggio + permesso + anti-doppione';
    });

    await prova('campagne: l\'interfaccia chiede di scrivere INVIA a mano', async () => {
      const h = fs.readFileSync('index.html', 'utf8');
      const f = (h.match(/async function cmpInvia\(id, nome, destinatari\)[\s\S]*?\n\}/) || [''])[0];
      deve(/scritto !== 'INVIA'/.test(f), 'basta un click per inviare');
      deve(/non si annulla/.test(f), 'non avverte che l\'azione è definitiva');
      deve(/destinatari_attesi: Number\(destinatari\)/.test(f), 'non dichiara al server quanti se ne aspetta');
    });

    await prova('campagne: il numero dei destinatari è sempre sotto gli occhi', async () => {
      const n = await page.evaluate(() => {
        window.CMP_LISTE = [];   // non basta: la variabile vera è di modulo
        return typeof window.cmpConta === 'function' && typeof window.cmpTestoInHtml === 'function';
      });
      deve(n, 'le funzioni delle campagne non ci sono');
      const h = fs.readFileSync('index.html', 'utf8');
      deve(/partirà a <b>' \+ n\.toLocaleString/.test(h), 'il conteggio non si mostra prima di creare');
      deve(/cmp-conta' \+ \(n > 500 \? ' tanti'/.test(h), 'un invio molto grande non viene evidenziato');
    });

    await prova('campagne: il testo si scrive normale, l\'HTML lo fa il programma', async () => {
      const r = await page.evaluate(() => ({
        html: window.cmpTestoInHtml('Primo paragrafo.\n\nSecondo con <script>alert(1)</script> dentro.'),
        vuoto: window.cmpTestoInHtml('')
      }));
      deve(/<p style/.test(r.html), 'i paragrafi non diventano HTML');
      deve((r.html.match(/<p style/g) || []).length === 2, 'la riga vuota non separa i paragrafi');
      deve(!/<script>/.test(r.html), 'il testo del cliente finisce nell\'email senza essere ripulito');
      deve(/&lt;script&gt;/.test(r.html), 'il contenuto pericoloso non è stato neutralizzato');
      return 'paragrafi + testo ripulito';
    });

    await prova('campagne: la pagina esiste ed è nel menu', async () => {
      deve(await page.evaluate(() => !!document.getElementById('page-campagne')), 'page-campagne non esiste');
      const sh = fs.readFileSync('/workspace/agente-sospesi/withus-one.js', 'utf8');
      deve(/l: 'Campagne email'[^}]*go: Q\('campagne'\)/.test(sh), 'la voce non è nel menu');
      deve(/campagne:\s*\['Campagne email'/.test(sh), 'manca il titolo nella barra');
    });

    /* ── Blocco C: la cronologia del cliente ─────────────────────────────── */
    await prova('cliente: la cronologia mette tutto in ordine di tempo', async () => {
      const r = await page.evaluate(async () => {
        // si prepara la scheda cliente con la sua linguetta
        document.getElementById('anag-overlay')?.remove();
        document.body.insertAdjacentHTML('beforeend',
          '<div id="anag-overlay"><div id="cl-cro"></div></div>');
        window.__COLLAUDO.risposte['quote_titoli:lista'] = { data: [
          { tipo: 'prima_rata', importo_lordo: 12, incassato_il: '2026-06-25', mezzo_pagamento: 'bonifico', stato: 'incassato', polizza_id: 'p1' },
          { tipo: 'rata', importo_lordo: 12, stato: 'aperto', polizza_id: 'p1' }
        ], error: null };
        window.__COLLAUDO.risposte['quote_pratica_documenti:lista'] = { data: [
          { categoria: 'privacy', nome: 'Privacy.pdf', creato_il: '2026-06-21T10:00:00Z', firmato: true, entita: 'polizza', entita_id: 'p1' }
        ], error: null };
        window.__COLLAUDO.risposte['quote_sinistri:lista'] = { data: [], error: null };
        window.__COLLAUDO.risposte['iam_trattative:lista'] = { data: [
          { creato_il: '2026-03-01T08:00:00Z', prodotto: 'RC Auto', stato: 'in corso', premio: 500 }
        ], error: null };
        const prev = [{ id: 'pv1', creato_il: '2026-05-02T11:00:00Z', prodotto: 'RC Vita Privata', premio: 144, creato_nome: 'Anna' }];
        const pol = [{ id: 'p1', numero: 1, numero_polizza: 'HDI/123', prodotto: 'RC Vita Privata',
                       compagnia: 'HDI', data_effetto: '2026-06-20', data_scadenza: '2027-06-20' }];
        await window.clCronologia('c1', 'Rossi Mario', prev, pol, { id: 'c1', creato_il: '2026-01-10T09:00:00Z' });
        const e = [...document.querySelectorAll('#cl-cro .cro-e')];
        return { n: e.length, testi: e.map(x => x.querySelector('.cro-t').textContent.trim()),
                 date: e.map(x => x.querySelector('.cro-q').textContent.trim()),
                 futuri: e.filter(x => x.classList.contains('fut')).length };
      });
      deve(r.n >= 6, 'eventi ricostruiti: ' + r.n + ' (' + r.testi.join(' | ') + ')');
      // ordine: dal più recente al più vecchio
      const ms = r.date.map(d => { const [g, m, a] = d.split(' ')[0].split('/'); return +new Date(`${a}-${m}-${g}`); });
      const ordinate = [...ms].sort((a, b) => b - a);
      deve(JSON.stringify(ms) === JSON.stringify(ordinate), 'non è in ordine di tempo: ' + r.date.join(', '));
      return r.n + ' eventi';
    });

    await prova('cliente: la storia raccoglie da tutte le fonti', async () => {
      const t = await page.evaluate(() => document.getElementById('cl-cro').textContent);
      deve(/Cliente inserito in anagrafica/.test(t), 'manca l\'inizio della storia');
      deve(/Preventivo · RC Vita Privata/.test(t), 'mancano i preventivi');
      deve(/Polizza emessa/.test(t), 'mancano le polizze');
      deve(/Incasso prima rata/.test(t) && /Bonifico/.test(t), 'mancano gli incassi');
      deve(/Documento · Privacy\.pdf/.test(t), 'mancano i documenti');
      deve(/Trattativa · RC Auto/.test(t), 'manca la faccia commerciale dall\'altra applicazione');
      return 'sei fonti diverse in una storia sola';
    });

    await prova('cliente: non si scrivono orari finti', async () => {
      // una polizza decorre "il 20 giugno", non "il 20 giugno alle 00:00"
      const r = await page.evaluate(() => ({
        soloData: window.croData('2026-06-20'),
        conOrario: window.croData('2026-05-02T11:04:00Z'),
        vuoto: window.croData(null)
      }));
      deve(r.soloData === '20/6/2026' || r.soloData === '20/06/2026', 'data pura con orario finto: ' + r.soloData);
      deve(/\d{1,2}:\d{2}/.test(r.conOrario), 'l\'orario vero è stato perso: ' + r.conOrario);
      deve(r.vuoto === '', 'valore assente mal gestito');
      return r.soloData + ' · ' + r.conOrario;
    });

    await prova('cliente: le scadenze future si distinguono dal passato', async () => {
      const r = await page.evaluate(() => {
        const e = [...document.querySelectorAll('#cl-cro .cro-e')];
        const fut = e.filter(x => x.classList.contains('fut'));
        return { futuri: fut.length, testo: fut.map(x => x.textContent).join(' '),
                 haEtichetta: fut.some(x => x.querySelector('.cro-fut')) };
      });
      // la scadenza 2027 è nel futuro: è un promemoria, non una cosa successa
      deve(r.futuri >= 1, 'nessun evento futuro riconosciuto');
      deve(/Scadenza polizza/.test(r.testo), 'la scadenza futura non è fra i futuri: ' + r.testo.slice(0, 80));
      deve(r.haEtichetta, 'gli eventi futuri non sono etichettati');
      return r.futuri + ' in arrivo';
    });

    await prova('cliente: una fonte che non risponde non cancella la storia', async () => {
      const n = await page.evaluate(async () => {
        window.__COLLAUDO.risposte['quote_titoli:lista'] = { data: null, error: { message: 'giù' } };
        window.__COLLAUDO.risposte['iam_trattative:lista'] = { data: null, error: { message: 'giù' } };
        const prev = [{ id: 'pv1', creato_il: '2026-05-02T11:00:00Z', prodotto: 'Casa', premio: 100 }];
        const pol = [{ id: 'p1', numero: 1, prodotto: 'Casa', data_effetto: '2026-06-20', data_scadenza: '2027-06-20' }];
        await window.clCronologia('c1', 'Rossi Mario', prev, pol, { id: 'c1', creato_il: '2026-01-10T09:00:00Z' });
        return document.querySelectorAll('#cl-cro .cro-e').length;
      });
      deve(n >= 3, 'con due fonti in errore la storia si è svuotata: ' + n + ' eventi');
      return n + ' eventi comunque';
    });

    await prova('cliente: senza eventi lo dice, non resta in caricamento', async () => {
      const t = await page.evaluate(async () => {
        window.__COLLAUDO.risposte['quote_pratica_documenti:lista'] = { data: [], error: null };
        await window.clCronologia('c9', '', [], [], null);
        return document.getElementById('cl-cro').textContent;
      });
      deve(/Nessun evento registrato/.test(t), 'resta in caricamento: ' + t.slice(0, 60));
    });

    await prova('cliente: la scheda ha la linguetta della cronologia', async () => {
      const h = fs.readFileSync('index.html', 'utf8');
      deve(/data-t="cro"/.test(h), 'manca la linguetta Cronologia');
      deve(/\['pol','prev','doc','sin','cro'\]/.test(h), 'clTab non conosce la nuova linguetta');
      // e le polizze della scheda vengono dall'entità vera, non dal vecchio flag
      deve(/from\('quote_polizze'\)[\s\S]{0,400}eq\('cliente_id', id\)/.test(h),
        'la scheda cliente non legge le polizze vere');
      deve(/polizze\.length \? polizze\.map/.test(h), 'il ripiego sul vecchio elenco è sparito: lo storico si perderebbe');
    });

    /* ── Blocco A: la catena del denaro ──────────────────────────────────── */
    await prova('titoli: le rate si calcolano dal frazionamento', async () => {
      const r = await page.evaluate(() => {
        const p = (fraz, premio) => window.titPiano({ data_effetto: '2026-01-31', premio_annuo: premio, frazionamento: fraz });
        return {
          annuale:  p('Annuale', 600).length,
          semestr:  p('Semestrale', 600).length,
          quadri:   p('Quadrimestrale', 600).length,
          trimestr: p('Trimestrale', 600).length,
          mensile:  p('Mensile', 600).length,
          vuoto:    p('Annuale', 0).length,
          scadenze: p('Trimestrale', 600).map(x => x.data_scadenza),
          tipi:     p('Trimestrale', 600).map(x => x.tipo)
        };
      });
      deve(r.annuale === 1 && r.semestr === 2 && r.quadri === 3 && r.trimestr === 4 && r.mensile === 12,
        'numero di rate sbagliato: ' + JSON.stringify(r));
      deve(r.vuoto === 0, 'senza premio non si generano rate');
      deve(JSON.stringify(r.scadenze) === JSON.stringify(['2026-01-31', '2026-04-30', '2026-07-31', '2026-10-31']),
        'date delle rate sbagliate: ' + r.scadenze.join(', '));
      deve(r.tipi[0] === 'prima_rata' && r.tipi[1] === 'rata', 'la prima rata non è distinta: ' + r.tipi.join(','));
      return 'cinque frazionamenti, date corrette a fine mese';
    });

    await prova('titoli: la somma delle rate fa sempre il premio esatto', async () => {
      // Su 12 rate di 144,50 € la divisione non è esatta: il centesimo che
      // avanza NON si può perdere, o la contabilità non torna.
      const r = await page.evaluate(() => {
        const casi = [[144.50, 'Mensile'], [1000, 'Trimestrale'], [0.03, 'Mensile'],
                      [99.99, 'Semestrale'], [2400, 'Mensile'], [100, 'Quadrimestrale']];
        return casi.map(([premio, fraz]) => {
          const rate = window.titPiano({ data_effetto: '2026-03-15', premio_annuo: premio, frazionamento: fraz });
          const somma = Math.round(rate.reduce((s, x) => s + x.importo_lordo, 0) * 100) / 100;
          return { premio, fraz, somma, rate: rate.length, ok: somma === premio };
        });
      });
      const sbagliati = r.filter(x => !x.ok);
      deve(sbagliati.length === 0,
        'la somma non torna: ' + sbagliati.map(x => `${x.premio} ${x.fraz} → ${x.somma}`).join(' | '));
      return r.length + ' casi, incluso 144,50 su 12 rate';
    });

    await prova('titoli: insoluto è una condizione, non un campo da aggiornare', async () => {
      const gg = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
      const r = await page.evaluate((d) => ({
        scadutoAperto:   window.titInsoluto({ stato: 'aperto', data_scadenza: d.ieri }),
        futuroAperto:    window.titInsoluto({ stato: 'aperto', data_scadenza: d.domani }),
        scadutoIncassato:window.titInsoluto({ stato: 'incassato', data_scadenza: d.ieri }),
        scadutoStornato: window.titInsoluto({ stato: 'stornato', data_scadenza: d.ieri }),
        senzaData:       window.titInsoluto({ stato: 'aperto', data_scadenza: null }),
        etichetta:       window.titStato({ stato: 'aperto', data_scadenza: d.ieri })[0]
      }), { ieri: gg(-1), domani: gg(1) });
      deve(r.scadutoAperto === true, 'un titolo scaduto e aperto deve essere insoluto');
      deve(r.futuroAperto === false, 'un titolo non scaduto non è insoluto');
      deve(r.scadutoIncassato === false, 'un titolo incassato non è insoluto anche se la data è passata');
      deve(r.scadutoStornato === false, 'uno stornato non è insoluto');
      deve(r.senzaData === false, 'senza data non si può dire che è insoluto');
      deve(r.etichetta === 'Insoluto', 'etichetta sbagliata: ' + r.etichetta);
      return 'cinque casi';
    });

    await prova('titoli: la generazione è idempotente', async () => {
      const r = await page.evaluate(async () => {
        // già presenti → non genera
        window.__COLLAUDO.db = [];
        window.__COLLAUDO.risposte['quote_titoli:lista'] = { data: [{ id: 't1' }], error: null };
        const gia = await window.titGenera('pol-1');
        const scrittureGia = window.__COLLAUDO.db.filter(o => o.tabella === 'quote_titoli' && o.operazione === 'insert').length;
        // nessuno presente → genera
        window.__COLLAUDO.db = [];
        window.__COLLAUDO.risposte['quote_titoli:lista'] = { data: [], error: null };
        window.__COLLAUDO.risposte['quote_polizze:single'] = { error: null, data: {
          id: 'pol-1', data_effetto: '2026-05-01', premio_annuo: 240, frazionamento: 'Trimestrale' } };
        const nuovo = await window.titGenera('pol-1');
        const scritture = window.__COLLAUDO.db.filter(o => o.tabella === 'quote_titoli' && o.operazione === 'insert');
        return { gia, scrittureGia, nuovo, righe: scritture[0] ? scritture[0].payload.length : 0,
                 primo: scritture[0] ? scritture[0].payload[0] : null };
      });
      deve(r.scrittureGia === 0 && r.gia.creati === 0, 'ha generato doppioni su una polizza che aveva già le rate');
      deve(r.nuovo.creati === 4 && r.righe === 4, 'rate generate: ' + r.nuovo.creati);
      deve(r.primo.polizza_id === 'pol-1' && r.primo.stato === 'aperto' && r.primo.importo_lordo === 60,
        'prima rata sbagliata: ' + JSON.stringify(r.primo));
      return '4 rate da 60 € su premio 240';
    });

    await prova('titoli: senza data di effetto o premio non si inventa nulla', async () => {
      const r = await page.evaluate(async () => {
        window.__COLLAUDO.db = [];
        window.__COLLAUDO.risposte['quote_titoli:lista'] = { data: [], error: null };
        window.__COLLAUDO.risposte['quote_polizze:single'] = { error: null, data: {
          id: 'pol-2', data_effetto: null, premio_annuo: null, frazionamento: 'Mensile' } };
        const esito = await window.titGenera('pol-2');
        return { esito, scritture: window.__COLLAUDO.db.filter(o => o.tabella === 'quote_titoli' && o.operazione === 'insert').length };
      });
      deve(r.scritture === 0, 'ha generato rate senza avere i dati');
      deve(/manca/.test(r.esito.motivo || ''), 'non spiega perché non ha generato: ' + r.esito.motivo);
    });

    await prova('titoli: la pagina esiste e sostituisce la voce «in arrivo»', async () => {
      const sh = fs.readFileSync('/workspace/agente-sospesi/withus-one.js', 'utf8');
      deve(!/l: 'Titoli e quietanze'[^}]*soon\(/.test(sh), 'la voce del menu dice ancora «in arrivo»');
      deve(/l: 'Titoli e quietanze', i: 'i-euro', go: Q\('titoli'\)/.test(sh), 'la voce non porta alla pagina');
      deve(await page.evaluate(() => !!document.getElementById('page-titoli')), 'page-titoli non esiste');
      await page.evaluate(() => showPage('titoli'));
      await page.waitForTimeout(120);
      deve(await page.evaluate(() => document.getElementById('page-titoli').classList.contains('active')),
        'la pagina non si attiva');
    });

    const gg2 = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
    const TITOLI_FINTI = [
      { id: 't1', polizza_id: 'p1', tipo: 'prima_rata', data_scadenza: gg2(-40), importo_lordo: 120, stato: 'aperto' },
      { id: 't2', polizza_id: 'p1', tipo: 'rata',       data_scadenza: gg2(-5),  importo_lordo: 120, stato: 'aperto' },
      { id: 't3', polizza_id: 'p1', tipo: 'rata',       data_scadenza: gg2(4),   importo_lordo: 120, stato: 'aperto' },
      { id: 't4', polizza_id: 'p1', tipo: 'rata',       data_scadenza: gg2(25),  importo_lordo: 120, stato: 'aperto' },
      { id: 't5', polizza_id: 'p1', tipo: 'quietanza',  data_scadenza: gg2(-60), importo_lordo: 500,
        stato: 'incassato', mezzo_pagamento: 'bonifico', incassato_il: gg2(-58) }
    ];

    await page.evaluate(async (finti) => {
      window.__COLLAUDO.risposte['quote_polizze:lista'] = { data: [
        { id: 'p1', numero: 1, numero_polizza: 'HDI/123', cliente: 'Rossi Mario', compagnia: 'HDI', data_effetto: '2026-01-01' }
      ], error: null };
      window.__COLLAUDO.risposte['quote_titoli:lista'] = { data: finti, error: null };
      await window.loadTitoli();
    }, TITOLI_FINTI);

    await prova('titoli: le fasce mostrano quanti e quanto', async () => {
      const f = await page.evaluate(() => [...document.querySelectorAll('#tit-fasce .rin-fascia')]
        .map(b => ({ n: b.querySelector('b').textContent, l: b.querySelectorAll('span')[0].textContent,
                     eur: b.querySelectorAll('span')[1].textContent })));
      const per = l => f.find(x => x.l === l);
      deve(f.length === 5, 'fasce: ' + f.length);
      deve(per('Insoluti').n === '2', 'insoluti: ' + per('Insoluti').n);
      deve(/240,00/.test(per('Insoluti').eur), 'importo insoluti sbagliato: ' + per('Insoluti').eur);
      deve(per('Entro 7 gg').n === '1', 'entro 7 giorni: ' + per('Entro 7 gg').n);
      deve(per('Da incassare').n === '4', 'da incassare: ' + per('Da incassare').n);
      deve(per('Tutti').n === '5', 'tutti: ' + per('Tutti').n);
      return 'insoluti 2 per 240 €';
    });

    await prova('titoli: i totali dicono quanto c\'è da recuperare', async () => {
      const t = await page.evaluate(() => { window.titFasciaScegli('tutti'); return document.getElementById('tit-totali').textContent; });
      deve(/5\s*titoli/.test(t), 'conteggio: ' + t);
      deve(/980,00/.test(t), 'somma sbagliata: ' + t);
      deve(/2 insoluti per .*240,00 .*da recuperare/.test(t), 'non dice quanto recuperare: ' + t);
    });

    await prova('titoli: si incassa in blocco, con riepilogo prima', async () => {
      const r = await page.evaluate(async () => {
        window.titFasciaScegli('insoluti');
        window.titSelTutti(true);
        const barra = document.getElementById('tit-barra');
        // si leggono PRIMA dell'incasso: dopo, la barra si richiude (giusto così)
        const visibile = barra.style.display !== 'none';
        const testoBarra = document.getElementById('tit-sel-testo').textContent;
        window.__COLLAUDO.db = [];
        window.__COLLAUDO.confermato = null;
        // il riepilogo passa da confirm(): si intercetta per leggerlo
        const _c = window.confirm;
        window.confirm = (m) => { window.__COLLAUDO.confermato = m; return true; };
        document.getElementById('tit-mezzo').value = 'contante';
        document.getElementById('tit-pagatore').value = 'Rossi Mario';
        await window.titIncassaSelezionati();
        window.confirm = _c;
        const agg = window.__COLLAUDO.db.filter(o => o.tabella === 'quote_titoli' && o.operazione === 'update');
        return { visibile, testoBarra, chiusaDopo: barra.style.display === 'none',
                 riepilogo: window.__COLLAUDO.confermato, aggiornati: agg.length,
                 payload: agg[0] && agg[0].payload };
      });
      deve(r.visibile, 'la barra dell\'incasso non compare con i titoli scelti');
      deve(/2 titoli scelti/.test(r.testoBarra) && /240,00/.test(r.testoBarra), 'la barra non dice cosa si sta incassando: ' + r.testoBarra);
      deve(/2 titoli/.test(r.riepilogo) && /240,00/.test(r.riepilogo) && /Contante/.test(r.riepilogo)
        && /Rossi Mario/.test(r.riepilogo), 'il riepilogo non è completo: ' + r.riepilogo);
      deve(r.aggiornati === 2, 'titoli aggiornati: ' + r.aggiornati);
      deve(r.payload.stato === 'incassato' && r.payload.mezzo_pagamento === 'contante'
        && r.payload.pagatore === 'Rossi Mario' && r.payload.incassato_il, 'registrazione incompleta: ' + JSON.stringify(r.payload));
      deve(r.chiusaDopo, 'la barra resta aperta dopo l\'incasso: sembrerebbe di poter incassare due volte');
      return '2 titoli, riepilogo verificato';
    });

    await prova('titoli: solo gli aperti si possono scegliere', async () => {
      const r = await page.evaluate(() => {
        window.titFasciaScegli('tutti');
        window.titSelTutti(true);
        const righe = [...document.querySelectorAll('#tit-body tr')];
        const conCasella = righe.filter(t => t.querySelector('input[type=checkbox]')).length;
        return { righe: righe.length, conCasella };
      });
      // due sono stati incassati dalla prova precedente, uno era già incassato
      deve(r.conCasella < r.righe, 'anche i titoli incassati hanno la casella di scelta');
      deve(r.conCasella === 2, 'caselle disponibili: ' + r.conCasella + ' (attese 2)');
    });

    await prova('titoli: l\'avviso sul menu conta gli insoluti', async () => {
      const b = await page.evaluate(() => {
        const e = document.getElementById('tit-badge');
        return { testo: e.textContent, visibile: e.style.display !== 'none' };
      });
      // dopo l'incasso dei due insoluti non ne restano
      deve(b.testo === '0' && !b.visibile, 'l\'avviso non si è aggiornato dopo l\'incasso: ' + JSON.stringify(b));
    });

    await prova('titoli: ogni emissione genera anche le rate', async () => {
      const h = fs.readFileSync('index.html', 'utf8');
      const blocco = (h.match(/async function creaPolizzaDaPreventivo[\s\S]*?\n\}/) || [''])[0];
      deve(/titGenera\(/.test(blocco), 'l\'emissione non genera le rate della polizza');
    });

    /* ── CRM Punto 3: documentale di pratica e checklist ─────────────────── */
    // La regola aziendale è fissata QUI, di proposito: cambiare l'elenco dei
    // requisiti cambia quando una polizza si considera perfezionata, quindi il
    // collaudo deve fermare la modifica e obbligare a una scelta consapevole.
    const REQ_ATTESI = [
      { cat: 'polizza_firmata',    obbl: true,  serveFirma: true },
      { cat: 'privacy',            obbl: true,  serveFirma: true },
      { cat: 'documento_identita', obbl: true,  serveFirma: false },
      { cat: 'presa_visione',      obbl: false, serveFirma: true }
    ];
    const OBBLIGATORI = REQ_ATTESI.filter(r => r.obbl);

    await prova('documenti: i requisiti sono quelli decisi, non altri', async () => {
      const h = fs.readFileSync('index.html', 'utf8');
      const blocco = (h.match(/const PDOC_REQUISITI = \[[\s\S]*?\];/) || [''])[0];
      deve(blocco, 'l\'elenco dei requisiti non si trova');
      for (const r of REQ_ATTESI) {
        const riga = new RegExp("cat: '" + r.cat + "'[^\\n]*serveFirma: " + r.serveFirma + "[^\\n]*obbl: " + r.obbl);
        deve(riga.test(blocco), 'requisito cambiato o mancante: ' + r.cat);
      }
      const quanti = (blocco.match(/cat: '/g) || []).length;
      deve(quanti === REQ_ATTESI.length, 'requisiti nel codice: ' + quanti + ', attesi ' + REQ_ATTESI.length);
      deve(/DA CONFERMARE CON FRANCESCO/.test(h), 'manca l\'avviso che è una regola aziendale da confermare');
      return REQ_ATTESI.length + ' requisiti, ' + OBBLIGATORI.length + ' obbligatori';
    });

    await prova('documenti: un requisito che manca si vede comunque', async () => {
      // È il senso della checklist: la cartella allegati mostra ciò che c'è,
      // la checklist mostra ciò che NON c'è.
      const n = await page.evaluate(() => window.pdocMancanti([]));
      deve(n === OBBLIGATORI.length,
        'con zero documenti dovrebbero mancare tutti gli obbligatori (' + OBBLIGATORI.length + '): ' + n);
    });

    await prova('documenti: caricato non è firmato (il caso che sfugge)', async () => {
      const conFirma = REQ_ATTESI.find(r => r.serveFirma && r.obbl);
      const senzaFirma = REQ_ATTESI.find(r => !r.serveFirma);
      const s = await page.evaluate(([cf, sf]) => ({
        vuoto:       window.pdocStato(cf, []).stato,
        caricato:    window.pdocStato(cf, [{ categoria: cf.cat, url: 'x', firmato: false }]).stato,
        firmato:     window.pdocStato(cf, [{ categoria: cf.cat, url: 'x', firmato: true }]).stato,
        // dove la firma non serve, il solo caricamento basta
        bastaCarico: window.pdocStato(sf, [{ categoria: sf.cat, url: 'x', firmato: false }]).stato,
        // un requisito senza file non conta, anche se la riga esiste
        rigaVuota:   window.pdocStato(cf, [{ categoria: cf.cat, url: null, firmato: true }]).stato
      }), [conFirma, senzaFirma]);
      deve(s.vuoto === 'mancante', 'senza documento: ' + s.vuoto);
      deve(s.caricato === 'caricato', 'caricato ma non firmato dovrebbe restare "caricato": ' + s.caricato);
      deve(s.firmato === 'firmato', 'firmato: ' + s.firmato);
      deve(s.bastaCarico === 'firmato', 'dove la firma non serve il carico deve bastare: ' + s.bastaCarico);
      deve(s.rigaVuota === 'mancante', 'una riga senza file non deve valere: ' + s.rigaVuota);
      return 'cinque stati distinti';
    });

    await prova('documenti: il perfezionamento è calcolato, non messo a mano', async () => {
      const r = await page.evaluate(async (obbl) => {
        const completi = obbl.map(x => ({ categoria: x.cat, url: 'x', firmato: true }));
        const parziali = completi.slice(0, obbl.length - 1);
        window.__COLLAUDO.db = [];
        window.__COLLAUDO.risposte['quote_polizze:single'] = { data: { perfezionata: false }, error: null };
        const conTutti = await window.pdocRicalcola('pol-1', completi);
        const scritture = window.__COLLAUDO.db.filter(o => o.tabella === 'quote_polizze' && o.operazione === 'update');
        return { conTutti, conParziali: window.pdocMancanti(parziali), scritture: scritture.length,
                 valore: scritture[0] && scritture[0].payload.perfezionata };
      }, OBBLIGATORI);
      deve(r.conTutti === true, 'con tutti i documenti la polizza deve risultare perfezionata');
      deve(r.conParziali === 1, 'togliendo un obbligatorio deve mancarne 1: ' + r.conParziali);
      deve(r.scritture === 1, 'il flag non è stato scritto sulla polizza: ' + r.scritture);
      deve(r.valore === true, 'valore scritto sbagliato: ' + r.valore);
    });

    await prova('documenti: non riscrive il flag se non è cambiato', async () => {
      // Una scrittura inutile a ogni apertura è rumore sul database e nella
      // traccia delle modifiche.
      const n = await page.evaluate(async (obbl) => {
        window.__COLLAUDO.db = [];
        window.__COLLAUDO.risposte['quote_polizze:single'] = { data: { perfezionata: true }, error: null };
        const completi = obbl.map(x => ({ categoria: x.cat, url: 'x', firmato: true }));
        await window.pdocRicalcola('pol-1', completi);
        return window.__COLLAUDO.db.filter(o => o.tabella === 'quote_polizze' && o.operazione === 'update').length;
      }, OBBLIGATORI);
      deve(n === 0, 'ha riscritto il flag pur essendo già giusto');
    });

    await prova('documenti: il riquadro elenca i requisiti e dice cosa manca', async () => {
      const r = await page.evaluate(async () => {
        window.__COLLAUDO.risposte['quote_pratica_documenti:lista'] = { data: [
          { id: 'd1', categoria: 'polizza_firmata', url: 'http://x/p.pdf', firmato: true, entita_id: 'p1' },
          { id: 'd2', categoria: 'privacy', url: 'http://x/pr.pdf', firmato: false, entita_id: 'p1' },
          { id: 'd3', categoria: 'quietanza', url: 'http://x/q.pdf', firmato: false, anno: 2026, entita_id: 'p1' }
        ], error: null };
        window.__COLLAUDO.risposte['quote_polizze:single'] = { data: { perfezionata: false }, error: null };
        await window.pdocApri('p1');
        const bd = document.getElementById('pdoc-bd');
        return { testo: bd.textContent.replace(/\s+/g, ' '),
                 righe: bd.querySelectorAll('.pdoc-r').length,
                 esito: bd.querySelector('.pdoc-esito').className };
      });
      deve(/Polizza firmata/.test(r.testo) && /Informativa privacy/.test(r.testo)
        && /Documento d'identità/.test(r.testo), 'la checklist non elenca i requisiti');
      deve(/Mancante/.test(r.testo), 'non segnala i mancanti');
      deve(/Caricato, da firmare/.test(r.testo), 'non distingue il caricato dal firmato');
      deve(/2 documenti obbligatori da completare/.test(r.testo), 'l\'esito in testa non conta giusto: ' + r.testo.slice(0, 140));
      deve(/ko/.test(r.esito), 'l\'esito non è segnalato come da completare');
      deve(/Quietanze/.test(r.testo) && /2026/.test(r.testo), 'le quietanze non sono raggruppate per anno');
      return r.righe + ' righe';
    });

    await prova('documenti: il rosso è solo per ciò che blocca', async () => {
      // Un facoltativo che manca non blocca il perfezionamento: segnarlo in
      // rosso insegnerebbe a ignorare il rosso.
      const r = await page.evaluate(() => {
        const righe = [...document.querySelectorAll('#pdoc-bd .pdoc-r')];
        const facolt = righe.find(t => /facoltativo/i.test(t.textContent));
        const obblMancante = righe.find(t => /Mancante/.test(t.textContent) && !/facoltativo/i.test(t.textContent));
        return {
          facoltClasse: facolt ? facolt.querySelector('.tk-badge').className : null,
          facoltTesto:  facolt ? facolt.querySelector('.tk-badge').textContent : null,
          obblClasse:   obblMancante ? obblMancante.querySelector('.tk-badge').className : null
        };
      });
      deve(r.facoltClasse && !/st-scad/.test(r.facoltClasse), 'il facoltativo mancante è in rosso: ' + r.facoltClasse);
      deve(r.facoltTesto === 'Non acquisito', 'etichetta del facoltativo: ' + r.facoltTesto);
      deve(/st-scad/.test(r.obblClasse || ''), 'l\'obbligatorio mancante non è in rosso: ' + r.obblClasse);
      return 'facoltativo neutro, obbligatorio rosso';
    });

    await prova('documenti: con tutto a posto lo dice, e chiude', async () => {
      const r = await page.evaluate(async (obbl) => {
        const completi = obbl
          .map((x, i) => ({ id: 'k' + i, categoria: x.cat, url: 'http://x/f.pdf', firmato: true, entita_id: 'p1' }));
        window.__COLLAUDO.risposte['quote_pratica_documenti:lista'] = { data: completi, error: null };
        window.__COLLAUDO.risposte['quote_polizze:single'] = { data: { perfezionata: false }, error: null };
        await window.pdocRidisegna('p1');
        const bd = document.getElementById('pdoc-bd');
        const out = { testo: bd.textContent.replace(/\s+/g, ' '), esito: bd.querySelector('.pdoc-esito').className };
        document.getElementById('pdoc-ov')?.remove();
        return out;
      }, OBBLIGATORI);
      deve(/polizza perfezionata/.test(r.testo), 'non dichiara il perfezionamento: ' + r.testo.slice(0, 120));
      deve(/ok/.test(r.esito) && !/ko/.test(r.esito), 'esito non positivo: ' + r.esito);
    });

    await prova('documenti: il portafoglio mostra quanti mancano senza aprire', async () => {
      const t = await page.evaluate(async () => {
        window.__COLLAUDO.risposte['quote_pratica_documenti:lista'] = { data: [], error: null };
        await window.loadPortafoglio();
        return document.getElementById('pf-body').textContent.replace(/\s+/g, ' ');
      });
      deve(/Documenti/.test(t), 'manca il tasto dei documenti nel portafoglio');
      deve(/Documenti 3/.test(t), 'non mostra il numero dei mancanti accanto al tasto: ' + t.slice(0, 200));
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
    /* Il parente deve stare sulla STESSA origine del riquadro: la guardia
       anti-incorniciamento (fail-closed) fa entrare solo iam./quoto. o
       same-origin. Su localhost non possiamo essere iam., quindi incorniciamo
       da una pagina della stessa origine (8077); il riquadro entra con l'hash
       #at/#rt, la strada di compatibilita' che resta viva quando il canale
       postMessage non ha un padre iam. a cui parlare. */
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.evaluate((src) => {
      const f = document.createElement('iframe');
      f.id = 'q'; f.setAttribute('style', 'width:1000px;height:700px;border:0');
      f.src = src;
      document.body.appendChild(f);
    }, BASE + '/?from=iam&page=storico#at=tok-ponte&rt=rtok-ponte');
    const frame = await (await page.waitForSelector('#q')).contentFrame();
    // il canale attende fino a 4s un padre iam. prima di ripiegare sull'hash
    await frame.waitForSelector('#main-screen', { state: 'visible', timeout: 12000 });
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
      deve(!(await frame.evaluate(() => window.__LOGIN_VISTO)),
        'LAMPO: il riquadro ha mostrato la schermata di accesso mentre il ponte ripristinava la sessione');
      deve(await frame.evaluate(() => document.getElementById('boot-screen').classList.contains('off')),
        'il velo di avvio e\' rimasto acceso sopra il preventivatore');
      deve(await frame.evaluate(() => document.getElementById('page-storico').classList.contains('active')),
        'la pagina chiesta dalla scocca non si è aperta');
    });
    await prova('ospite: i token del ponte spariscono dall\'indirizzo', async () => {
      const h = await frame.evaluate(() => location.hash);
      deve(!/(^|[#&])(at|rt)=/.test(h), 'i token del ponte sono rimasti nella URL: ' + h);
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

  /* ── I preventivi si aprono anche se il profilo non e' ancora arrivato ────
     Bug del 30/07/2026, segnalato dal collaudo esterno: otto procedure
     leggevano `currentUser.rete` in apertura. `currentUser` si popola DOPO il
     profilo: aprendo un prodotto prima, quella lettura sollevava un errore e
     il riquadro restava vuoto con i soli tasti INDIETRO/AVANTI, senza nessun
     messaggio. Questa prova apre i wizard SENZA profilo: se qualcuno ne
     aggiunge un altro che legge il profilo senza protezione, diventa rossa. */
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errori = [];
    page.on('pageerror', (e) => errori.push(String(e.message)));
    await page.addInitScript(initScript(true));
    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    /* Si toglie di mezzo il profilo: e' esattamente lo stato in cui si trova
       la pagina nei primi istanti, o se il database non risponde. */
    await page.evaluate(() => { window.currentUser = null; });

    const WIZARD = [
      ['Casa', 'openCasa', 'page-casa'],
      ['RC Vita Privata', 'openRcVitaPrivata', 'page-rcvp'],
      ['Infortuni del conducente', 'openInfCirc', 'page-infcirc'],
      ['Auto', 'openAuto', 'page-auto'],
      ['RC fabbricati', 'openRCab', 'page-rcab'],
      ['Furto e incendio', 'openFI', 'page-fi'],
      ['Impresa per categoria', 'openICat', 'page-impresa-cat']
    ];
    for (const [nome, fn, pid] of WIZARD) {
      await prova('preventivo «' + nome + '»: si apre anche senza profilo caricato', async () => {
        const r = await page.evaluate(([f, pp]) => {
          if (typeof window[f] !== 'function') return { err: 'manca ' + f };
          try { window[f](); } catch (e) { return { err: e.message }; }
          const el = document.getElementById(pp);
          return { campi: el ? el.querySelectorAll('input,select,textarea').length : -1 };
        }, [fn, pid]);
        deve(!r.err, 'ha sollevato: ' + r.err);
        deve(r.campi > 0, 'il riquadro e\' rimasto vuoto: ' + r.campi + ' campi');
      });
    }
    await prova('preventivi senza profilo: nessun errore JavaScript', async () => {
      deve(errori.length === 0, errori.slice(0, 3).join(' | '));
    });
    await context.close();
  }

  /* ── FONTI ILLEGGIBILI: nel dubbio NON si quota ──────────────────────────
     Scelta dell'utente del 26/08/2026 (fail-closed). Escludere una compagnia
     e' quasi sempre una decisione contrattuale: quotarla lo stesso perche' non
     si e' riusciti a leggere il pannello Fonti e' un danno, non un ripiego.
     Qui la rete e' finta e /preventivi/motor-attive risponde {}: e' proprio il
     caso "non so chi e' abilitato". */
  {
    const { context, page, errori } = await nuovaPagina(browser, { sessione: true, url: BASE + '/' });
    await page.waitForSelector('#main-screen', { state: 'visible', timeout: 8000 });
    await page.evaluate(() => {
      openAuto('Autovettura');
      AUTO_DATA.contraente = { cognome: 'Collaudo', nome: 'Prova' };
      AUTO_STEP = 5; renderAutoStep();
    });
    await page.waitForSelector('#aw-blocco-fonti', { state: 'visible', timeout: 8000 }).catch(() => {});

    await prova('interruttori illeggibili: la quotazione NON parte', async () => {
      deve(await page.locator('#aw-blocco-fonti').isVisible(), 'manca il messaggio di blocco: si sta quotando senza sapere chi e\' abilitato');
      const viste = await page.evaluate(() => [...document.querySelectorAll('[id^="aw-premio-box"]')]
        .filter(b => b.offsetParent !== null).map(b => b.id));
      deve(viste.length === 0, 'compagnie mostrate senza sapere se sono abilitate: ' + viste.join(', '));
    });
    await prova('interruttori illeggibili: il messaggio spiega che nessuna compagnia e\' stata interrogata', async () => {
      const t = (await page.textContent('#aw-blocco-fonti').catch(() => '') || '').toLowerCase();
      deve(t.includes('non ho interrogato nessuna compagnia'), 'non dice che nessuna compagnia e\' stata interrogata');
      deve(t.includes('interruttori'), 'non dice che il problema e\' la lettura degli interruttori');
      deve(await page.locator('#aw-blocco-fonti button').count() > 0, 'manca il tasto Riprova');
    });
    await prova('interruttori illeggibili: senza mappa nessuna compagnia risulta abilitata', async () => {
      deve(await page.evaluate(() => awFonteAttiva('italiana') === false && awFonteAttiva('prima') === false),
        'awFonteAttiva() dice ancora di si\' senza mappa: e\' il fail-open di prima');
    });
    await prova('interruttori illeggibili: nessun errore JavaScript', async () => {
      deve(errori.length === 0, errori.slice(0, 3).join(' | '));
    });
    await context.close();
  }

  /* ── Infortuni: il modulo non resta muto, e non dichiara al posto tuo ────
     Punti 13 e 14 del collaudo esterno del 30/07/2026. */
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(initScript(true));
    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const avvisi = [];
    await page.evaluate(() => { window.__avvisi = []; window.alert = (m) => window.__avvisi.push(String(m)); });

    await prova('Infortuni: la dichiarazione sui sinistri NON e\' gia\' spuntata', async () => {
      const spuntata = await page.evaluate(() => document.getElementById('inf-nosin')?.checked);
      deve(spuntata === false, 'una dichiarazione con valenza contrattuale non si pre-seleziona');
    });

    await prova('Infortuni: il tasto Calcola si puo\' premere', async () => {
      const spento = await page.evaluate(() => document.getElementById('inf-btn')?.disabled);
      deve(spento === false, 'il tasto e\' spento: chi lo preme non capisce perche\' non succede nulla');
    });

    await prova('Infortuni: premendo Calcola a vuoto, dice che cosa manca', async () => {
      const r = await page.evaluate(() => {
        window.__avvisi = [];
        document.getElementById('inf-dob').value = '';
        document.getElementById('inf-tipo').value = '';
        document.getElementById('inf-nosin').checked = false;
        try { calcInfortuni(); } catch (e) { return { err: e.message }; }
        return {
          avviso: window.__avvisi.join(' '),
          segnati: document.querySelectorAll('#page-infortuni .manca, .manca').length
        };
      });
      deve(!r.err, 'ha sollevato: ' + r.err);
      deve(/Data di Nascita/.test(r.avviso), 'non nomina la data di nascita: «' + r.avviso + '»');
      deve(/Tipologia Lavoro/.test(r.avviso), 'non nomina la tipologia lavoro: «' + r.avviso + '»');
      deve(/dichiarazione/i.test(r.avviso), 'non nomina la dichiarazione: «' + r.avviso + '»');
      deve(r.segnati >= 2, 'non ha segnato i campi vuoti: ' + r.segnati);
    });

    await prova('Infortuni: i campi vuoti si nominano come si leggono a schermo', async () => {
      const r = await page.evaluate(() => typeof infortuniMancanze === 'function'
        ? infortuniMancanze('', '', false) : null);
      deve(Array.isArray(r) && r.length === 3, 'infortuniMancanze non elenca tutto: ' + JSON.stringify(r));
      deve(!r.some(x => /inf-|_/.test(x)), 'usa nomi di caselle invece di etichette: ' + JSON.stringify(r));
    });

    await prova('Infortuni: con i dati a posto non blocca piu\' nulla', async () => {
      const r = await page.evaluate(() => infortuniMancanze('1980-01-01', 'Dipendenti', true));
      deve(r.length === 0, 'blocca anche con tutto pieno: ' + JSON.stringify(r));
    });

    await context.close();
  }

  /* ── Codice fiscale e doppioni (punto 12 del collaudo esterno) ─────────── */
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(initScript(true));
    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    await prova('codice fiscale: accetta quelli veri', async () => {
      const r = await page.evaluate(() => ['RSSMRA80A01H501U', 'rss mra 80 a01 h501u'].map(c => cfValido(c)));
      deve(r.every(Boolean), 'ha rifiutato un codice valido: ' + JSON.stringify(r));
    });

    await prova('codice fiscale: rifiuta forma sbagliata e carattere di controllo errato', async () => {
      const r = await page.evaluate(() => ({
        corto:    cfValido('RSSMRA80A01H501'),
        lungo:    cfValido('RSSMRA80A01H501UX'),
        controllo:cfValido('RSSMRA80A01H501A'),
        mese:     cfValido('RSSMRA80Z01H501U'),
        vuoto:    cfValido('')
      }));
      deve(!r.corto && !r.lungo && !r.controllo && !r.mese && !r.vuoto,
        'ne ha accettato uno sbagliato: ' + JSON.stringify(r));
    });

    await prova('codice fiscale: l\'omocodia non viene scambiata per un errore', async () => {
      /* Quando due persone otterrebbero lo stesso codice, l'Agenzia sostituisce
         delle cifre con lettere. Rifiutarli bloccherebbe clienti veri. */
      const ok = await page.evaluate(() => cfFormaValida('RSSMRAURA01H5L1U'));
      deve(ok === true, 'la forma con omocodia e\' stata rifiutata');
    });

    await prova('codice fiscale: dice PERCHE\' non va bene', async () => {
      const r = await page.evaluate(() => ({
        corto: cfMotivo('ABC'), controllo: cfMotivo('RSSMRA80A01H501A'), buono: cfMotivo('RSSMRA80A01H501U')
      }));
      deve(/16 caratteri/.test(r.corto), 'non dice la lunghezza: ' + r.corto);
      deve(/controllo/.test(r.controllo), 'non nomina il carattere di controllo: ' + r.controllo);
      deve(r.buono === '', 'si lamenta di un codice giusto: ' + r.buono);
    });

    await prova('partita IVA: controllata anche lei', async () => {
      const r = await page.evaluate(() => ({ buona: pivaValida('00743110157'), storta: pivaValida('12345678901'), corta: pivaValida('1234') }));
      deve(r.buona && !r.storta && !r.corta, JSON.stringify(r));
    });

    await prova('cliente gia\' in archivio: si riusa, non si duplica', async () => {
      const r = await page.evaluate(async () => {
        window.__COLLAUDO.db = [];
        window.__COLLAUDO.risposte['quote_anagrafiche:lista'] =
          { data: [{ id: 'gia-c-e', nominativo: 'ANGUZZA ANTONIO' }], error: null };
        const out = await censisciCliente({ nominativo: 'Anguzza Antonio', cf: 'RSSMRA80A01H501U', origine: 'prova' });
        return { out, inserimenti: window.__COLLAUDO.db.filter(o => o.operazione === 'insert').length };
      });
      deve(r.out && r.out.id === 'gia-c-e', 'non ha riusato la scheda esistente: ' + JSON.stringify(r.out));
      deve(r.out.esisteva === true, 'non segnala che esisteva gia\'');
      deve(r.inserimenti === 0, 'ha creato un doppione lo stesso: ' + r.inserimenti + ' inserimenti');
    });

    await prova('codice fiscale storto: il cliente non si crea affatto', async () => {
      const r = await page.evaluate(async () => {
        window.__COLLAUDO.db = [];
        window.__COLLAUDO.risposte['quote_anagrafiche:lista'] = { data: [], error: null };
        const out = await censisciCliente({ nominativo: 'Tizio', cf: 'CODICESTORTO123X', origine: 'prova' });
        return { out, inserimenti: window.__COLLAUDO.db.filter(o => o.operazione === 'insert').length };
      });
      deve(r.out.id === null, 'lo ha creato lo stesso');
      deve(!!r.out.motivo, 'non spiega perche\' ha rifiutato');
      deve(r.inserimenti === 0, 'ha scritto in archivio: ' + r.inserimenti);
    });

    await prova('schermata Clienti: un doppione si vede PRIMA, non lo dice il database', async () => {
      /* Dal 03/08/2026 codice fiscale e partita IVA sono unici nella tabella.
         Senza un controllo prima, l'unica cosa che vedeva chi stava davanti
         allo schermo era un errore del database — e il messaggio, per giunta,
         diceva di rieseguire uno script SQL che non c'entrava niente. */
      const r = await page.evaluate(async () => {
        window.__COLLAUDO.db = [];
        window.__COLLAUDO.alerts = [];
        window.__COLLAUDO.risposte['quote_anagrafiche:lista'] =
          { data: [{ id: 'gia-c-e', nominativo: 'ROSSI MARIO', codice_fiscale: 'RSSMRA80A01H501U' }], error: null };
        showPage('anagrafiche'); anagTab('nuova'); setAnagTipo('fisica');
        const v = (id, val) => { const e = document.getElementById(id); if (e) e.value = val; };
        v('ag-cognome', 'Rossi'); v('ag-nome', 'Mario'); v('ag-cf', 'RSSMRA80A01H501U');
        await salvaNuovaAnagrafica();
        return { inserimenti: window.__COLLAUDO.db.filter(o => o.tabella === 'quote_anagrafiche' && o.operazione === 'insert').length,
                 avvisi: window.__COLLAUDO.alerts || [] };
      });
      deve(r.inserimenti === 0, 'ha provato a inserire un doppione: ' + r.inserimenti);
      const testo = r.avvisi.join(' | ');
      deve(/gi\u00e0 in archivio/i.test(testo), 'non dice che il cliente c\'era gia\': «' + testo + '»');
      deve(!/script SQL/i.test(testo), 'manda ancora a rieseguire lo script SQL: «' + testo + '»');
    });

    await prova('lead: si inserisce a mano, e chiede il nominativo e un recapito', async () => {
      /* Prima un lead si poteva solo RICEVERE dal preventivatore: a mano si
         inseriva per forza un cliente, anche senza privacy firmata. */
      const r = await page.evaluate(async () => {
        window.__COLLAUDO.db = []; window.__COLLAUDO.alerts = [];
        window.__COLLAUDO.risposte['quote_anagrafiche:lista'] = { data: [], error: null };
        showPage('anagrafiche'); anagTab('nuova'); setAnagTipo('fisica'); setAnagLead(true);
        const v = (id, val) => { const e = document.getElementById(id); if (e) e.value = val; };
        ['ag-cognome','ag-nome','ag-cf','ag-cel','ag-email','ag-tel'].forEach(i => v(i, ''));

        v('ag-cognome', 'Bianchi');
        await salvaNuovaAnagrafica();                 // senza recapito: deve fermarsi
        const senzaRecapito = window.__COLLAUDO.db.filter(o => o.tabella === 'quote_anagrafiche' && o.operazione === 'insert').length;

        v('ag-cel', '3401234567');
        await salvaNuovaAnagrafica();                 // con il recapito: passa, SENZA codice fiscale
        const ins = window.__COLLAUDO.db.filter(o => o.tabella === 'quote_anagrafiche' && o.operazione === 'insert');
        return { senzaRecapito, inseriti: ins.length, riga: ins[0] && ins[0].payload,
                 avvisi: window.__COLLAUDO.alerts || [] };
      });
      deve(r.senzaRecapito === 0, 'ha salvato un lead senza nessun recapito');
      deve(/recapito/i.test(r.avvisi.join(' ')), 'non dice che manca il recapito: ' + r.avvisi.join(' | '));
      deve(r.inseriti === 1, 'il lead non e\' stato inserito: ' + r.inseriti);
      deve(r.riga.lead === true, 'non e\' marcato come lead: ' + JSON.stringify(r.riga.lead));
      deve(r.riga.lead_origine === 'inserito a mano', 'manca da dove arriva: ' + r.riga.lead_origine);
      deve(!r.riga.codice_fiscale, 'pretende ancora il codice fiscale da un lead');
    });

    await prova('lead: un cliente inserito a mano NON diventa un lead', async () => {
      const r = await page.evaluate(async () => {
        window.__COLLAUDO.db = []; window.__COLLAUDO.alerts = [];
        window.__COLLAUDO.risposte['quote_anagrafiche:lista'] = { data: [], error: null };
        showPage('anagrafiche'); anagTab('nuova'); setAnagTipo('fisica'); setAnagLead(false);
        const v = (id, val) => { document.getElementById(id).value = val; };
        v('ag-cognome', 'Verdi'); v('ag-nome', 'Giuseppe'); v('ag-cf', 'VRDGPP80A01H501R');
        await salvaNuovaAnagrafica();
        const ins = window.__COLLAUDO.db.filter(o => o.tabella === 'quote_anagrafiche' && o.operazione === 'insert');
        return { n: ins.length, riga: ins[0] && ins[0].payload };
      });
      deve(r.n === 1, 'il cliente non e\' stato inserito');
      deve(r.riga.lead === false, 'un cliente normale viene marcato come lead');
      deve(!r.riga.note || !/LEAD/.test(r.riga.note), 'gli mette il marcatore LEAD nelle note');
    });

    await prova('auto: il lead non si salva piu\' da solo — si sceglie', async () => {
      /* Il difetto: durante il recupero del veicolo il nominativo finiva in
         archivio all'istante. Chi quotava una targa per curiosita' si trovava
         un cliente nuovo senza averlo chiesto. */
      const r = await page.evaluate(async () => {
        window.__COLLAUDO.db = [];
        try { localStorage.removeItem('quoto.lead.scelta'); } catch (e) {}
        window.__COLLAUDO.risposte['quote_anagrafiche:lista'] = { data: [], error: null };
        window.AUTO_DATA = window.AUTO_DATA || {};
        AUTO_DATA.contraente = {}; AUTO_DATA.leadInAttesa = null; AUTO_DATA.leadScelta = null;
        const fill = { cf: 'RSSMRA80A01H501U', cognome: 'Rossi', nome: 'Mario' };
        const esito = await awConsolidaCliente(fill, 'ROSSI MARIO');
        const subito = window.__COLLAUDO.db.filter(o => o.tabella === 'quote_anagrafiche' && o.operazione === 'insert').length;
        AUTO_DATA.recuperoStato = 'ok';
        const riquadro = awBannerRecuperoHTML();
        return { esito, subito, inAttesa: !!AUTO_DATA.leadInAttesa, riquadro };
      });
      deve(r.subito === 0, 'ha salvato il lead da solo: ' + r.subito + ' scritture');
      deve(r.inAttesa, 'il nominativo non e\' rimasto in attesa di una scelta');
      deve(r.esito && r.esito.inAttesa === true, 'non segnala che la scelta manca');
      deve(/Salva come lead/.test(r.riquadro), 'il riquadro non offre di salvarlo');
      deve(/Non salvare/.test(r.riquadro), 'il riquadro non offre di NON salvarlo');
    });

    await prova('auto: «Non salvare» non scrive niente, e il preventivo prosegue', async () => {
      const r = await page.evaluate(async () => {
        window.__COLLAUDO.db = [];
        awScartaLeadInAttesa();
        AUTO_DATA.recuperoStato = 'ok';
        return { scritture: window.__COLLAUDO.db.filter(o => o.tabella === 'quote_anagrafiche' && o.operazione === 'insert').length,
                 inAttesa: !!AUTO_DATA.leadInAttesa, riquadro: awBannerRecuperoHTML() };
      });
      deve(r.scritture === 0, 'ha scritto lo stesso: ' + r.scritture);
      deve(!r.inAttesa, 'il nominativo resta in attesa');
      deve(/non salvato/i.test(r.riquadro), 'non dice che non e\' stato salvato: ' + r.riquadro.slice(0, 120));
    });

    await prova('auto: la scelta ricordata si applica da sola, e lo dice', async () => {
      const r = await page.evaluate(async () => {
        window.__COLLAUDO.db = [];
        try { localStorage.setItem('quoto.lead.scelta', 'salva'); } catch (e) {}
        AUTO_DATA.contraente = {}; AUTO_DATA.leadInAttesa = null; AUTO_DATA.leadScelta = null;
        window.__COLLAUDO.risposte['quote_anagrafiche:lista'] = { data: [], error: null };
        await awConsolidaCliente({ cf: 'RSSMRA80A01H501U', cognome: 'Rossi', nome: 'Mario' }, 'ROSSI MARIO');
        AUTO_DATA.recuperoStato = 'ok'; AUTO_DATA.recuperoNominativo = 'ROSSI MARIO';
        /* Filtro per TABELLA: logMovimento scrive anche nel registro, e senza
           filtro quella riga verrebbe contata come un secondo cliente. */
        const out = { scritture: window.__COLLAUDO.db.filter(o => o.tabella === 'quote_anagrafiche' && o.operazione === 'insert').length,
                      scelta: AUTO_DATA.leadScelta, riquadro: awBannerRecuperoHTML() };
        try { localStorage.removeItem('quoto.lead.scelta'); } catch (e) {}
        return out;
      });
      deve(r.scritture === 1, 'la scelta ricordata non ha salvato: ' + r.scritture);
      deve(r.scelta === 'salva-auto', 'non distingue la scelta ricordata da quella fatta ora: ' + r.scelta);
      deve(/scelta ricordata/i.test(r.riquadro), 'non dice che ha agito per una scelta ricordata');
    });

    await prova('barra di ricerca: trova anche se la schermata era su «Nuovo cliente»', async () => {
      /* Il sintomo segnalato: si scrive un nominativo nella barra in alto e
         «non funziona». La ricerca partiva davvero — ma se la schermata era
         rimasta sulla linguetta «Nuovo cliente», i risultati finivano dentro
         un riquadro nascosto. */
      const r = await page.evaluate(async () => {
        window.__COLLAUDO.risposte['quote_anagrafiche:lista'] =
          { data: [{ id: 'c1', tipo: 'fisica', nominativo: 'ODDO FRANCESCO', codice_fiscale: 'DDOFNC93A01H501Z' }], error: null };
        showPage('anagrafiche');
        anagTab('nuova');                                  // la schermata resta di lato
        document.getElementById('anag-q').value = 'oddo francesco';
        anagTab('cerca');                                  // quello che fa adesso la barra
        await cercaAnagrafica();
        const tab = document.getElementById('anag-cerca').style.display;
        return { tab, righe: document.getElementById('anag-results').innerHTML };
      });
      deve(r.tab !== 'none', 'il riquadro dei risultati resta nascosto');
      deve(/ODDO FRANCESCO/.test(r.righe), 'il cliente cercato non compare: ' + r.righe.slice(0, 120));
    });

    await prova('barra di ricerca: se il nominativo e\' un lead, ci porta fra i lead', async () => {
      /* «Nessun cliente trovato» mentre il nominativo c'e', solo nell'altro
         elenco: da fuori si legge come una barra rotta. */
      const r = await page.evaluate(async () => {
        window.__COLLAUDO.risposte['quote_anagrafiche:lista'] =
          { data: [{ id: 'l1', tipo: 'fisica', nominativo: 'ODDO FRANCESCO', note: 'LEAD · rinnovo auto' }], error: null };
        showPage('anagrafiche'); anagTab('cerca'); anagView('clienti');   // guardo i CLIENTI
        document.getElementById('anag-q').value = 'oddo';
        await cercaAnagrafica();
        return { vista: ANAG_VIEW, righe: document.getElementById('anag-results').innerHTML,
                 linguetta: document.getElementById('anag-view-lead').className };
      });
      deve(r.vista === 'lead', 'resta sui clienti e non trova niente: vista = ' + r.vista);
      deve(/ODDO FRANCESCO/.test(r.righe), 'il nominativo non compare comunque');
      deve(/active/.test(r.linguetta), 'la linguetta Lead non risulta quella attiva: si vedrebbero righe sotto l\'etichetta sbagliata');
    });

    await prova('beni: ogni prodotto sta nella sua famiglia, i catastrofali a parte', async () => {
      /* Erano sette riquadri in fila, come se fossero la stessa cosa: la
         polizza della casa accanto alla RC di uno stabilimento balneare. */
      const r = await page.evaluate(() => {
        showPage('beni'); renderBeni();
        const g = [...document.querySelectorAll('#beni-grid .beni-gruppo')].map(e => ({
          titolo: e.querySelector('.beni-gruppo-t').textContent,
          prodotti: [...e.querySelectorAll('.mod-name')].map(n => n.textContent)
        }));
        return { g, senzaFamiglia: BENI_PRODUCTS.filter(p => !p.gruppo).length,
                 totali: BENI_PRODUCTS.length,
                 mostrati: document.querySelectorAll('#beni-grid .mod-card').length };
      });
      deve(r.senzaFamiglia === 0, r.senzaFamiglia + ' prodotti non hanno una famiglia');
      deve(r.mostrati === r.totali, 'a schermo ' + r.mostrati + ' prodotti su ' + r.totali + ': qualcuno si e\' perso');
      const cat = r.g.find(x => /catastrofali/i.test(x.titolo));
      deve(cat, 'i rischi catastrofali non hanno una sezione loro');
      deve(cat.prodotti.length === 1 && /catastrofali/i.test(cat.prodotti[0]),
        'nella sezione catastrofali c\'e\' altro: ' + cat.prodotti.join(', '));
      const casa = r.g.find(x => x.prodotti.includes('Casa'));
      deve(casa && /immobili/i.test(casa.titolo), 'la Casa non sta fra gli immobili');
      deve(!casa.prodotti.includes('Lidi Balneari'), 'i lidi balneari stanno ancora insieme alla casa');
      return r.g.length + ' famiglie: ' + r.g.map(x => x.titolo).join(' · ');
    });

    await prova('menu prodotti: ogni chiave apre il SUO prodotto, non la pagina che li contiene', async () => {
      /* Il menu «Nuovo preventivo» aveva cinque etichette Motor che aprivano
         tutte la stessa schermata: la scelta andava rifatta a mano dentro.
         Il menu prometteva una strada e ne apriva un'altra. */
      const r = await page.evaluate(() => {
        const esiti = {};
        for (const k of Object.keys(PRODOTTI_DIRETTI)) {
          AUTO_DATA = {}; 
          const ok = apriProdotto(k);
          const pagina = [...document.querySelectorAll('.page')].find(p => p.classList.contains('active'));
          esiti[k] = { ok, pagina: pagina ? pagina.id : null, veicolo: (AUTO_DATA || {}).tipoVeicolo || null };
        }
        return { esiti, sconosciuta: apriProdotto('non-esiste'), vuota: apriProdotto('') };
      });
      deve(r.sconosciuta === false, 'una chiave sconosciuta apre qualcosa lo stesso');
      deve(r.vuota === false, 'una chiave vuota apre qualcosa lo stesso');
      const attesi = {
        autovetture:  ['page-auto', 'Autovettura'],
        motocicli:    ['page-auto', 'Motociclo'],
        autocarri:    ['page-auto', 'Autocarro'],
        imbarcazioni: ['page-auto', 'Imbarcazione'],
        conducente:   ['page-auto', 'Infortuni al conducente'],
        storici:      ['page-saravintage', null],
        cvtard:       ['page-cvtard', null],
      };
      for (const [k, [pag, veic]] of Object.entries(attesi)) {
        const e = r.esiti[k];
        deve(e && e.ok, 'la chiave «' + k + '» non apre niente');
        deve(e.pagina === pag, k + ' apre «' + e.pagina + '» invece di «' + pag + '»');
        if (veic) deve(e.veicolo === veic, k + ' apre il veicolo «' + e.veicolo + '» invece di «' + veic + '»');
      }
      /* Due chiavi che aprono lo stesso identico prodotto sarebbero due voci
         di menu per la stessa cosa: e' il difetto che stiamo togliendo. */
      const firme = Object.values(r.esiti).map(e => e.pagina + '/' + e.veicolo);
      deve(new Set(firme).size === firme.length, 'due voci aprono lo stesso prodotto: ' + firme.join(', '));
      return Object.keys(attesi).length + ' prodotti, ognuno con la sua schermata';
    });

    await prova('menu prodotti: il parametro nell\'indirizzo apre il prodotto', async () => {
      const p2 = await context.newPage();
      await p2.addInitScript(initScript(true));
      await p2.goto(BASE + '/index.html?page=rca&prod=motocicli', { waitUntil: 'domcontentloaded' });
      await p2.waitForTimeout(2000);
      const r = await p2.evaluate(() => {
        const pagina = [...document.querySelectorAll('.page')].find(p => p.classList.contains('active'));
        /* AUTO_DATA e' un `let` di primo livello: non e' una proprieta' di
           window, e window.AUTO_DATA sarebbe sempre undefined. */
        return { pagina: pagina ? pagina.id : null, veicolo: (AUTO_DATA || {}).tipoVeicolo || null };
      });
      await p2.close();
      deve(r.pagina === 'page-auto', 'l\'indirizzo non apre il prodotto: pagina «' + r.pagina + '»');
      deve(r.veicolo === 'Motociclo', 'apre il veicolo sbagliato: «' + r.veicolo + '»');
    });

    await prova('kit grafico: niente emoji di sistema nell\'interfaccia', async () => {
      /* Un'emoji Unicode la disegna il sistema operativo: la stessa faccina e'
         gialla su un telefono, piatta su Windows e diversa ancora su un Mac. In
         un gestionale assicurativo un simbolo che cambia forma a seconda di chi
         guarda non e' un simbolo. Al loro posto vanno le icone Tabler. */
      const r = await page.evaluate(() => {
        const testo = document.documentElement.outerHTML;
        const trovate = testo.match(/[\u{1F300}-\u{1FAFF}]/gu) || [];
        return { n: trovate.length, quali: [...new Set(trovate)].slice(0, 8) };
      });
      deve(r.n === 0, r.n + ' emoji di sistema ancora a schermo: ' + r.quali.join(' '));
    });

    await prova('kit grafico: il pittogramma sta nelle schede, non nei pulsanti', async () => {
      /* La regola del kit: mai dentro pulsanti, tabelle o pastiglie di stato.
         Un pittogramma in un pulsante lo fa sembrare una scheda; in una tabella,
         riga dopo riga, diventa rumore. */
      const r = await page.evaluate(() => {
        showPage('rca');
        const p = [...document.querySelectorAll('.mod-ic, .wus-pictogram')];
        const dentroPulsanti = p.filter(e => e.closest('button, .btn-inf, .btn-add, .btn-sec')).length;
        const dentroTabelle  = p.filter(e => e.closest('table')).length;
        const dentroBadge    = p.filter(e => e.closest('.mod-badge, .badge-quot, .badge-live, .badge-soon')).length;
        const schede = [...document.querySelectorAll('#rca-grid .mod-card, .mod-card')];
        const conPiuDiUno = schede.filter(c => c.querySelectorAll('.mod-ic, .wus-pictogram').length > 1).length;
        const st = p.length ? getComputedStyle(p[0]) : null;
        return { tot: p.length, dentroPulsanti, dentroTabelle, dentroBadge, conPiuDiUno,
                 lato: st ? parseFloat(st.width) : 0, raggio: st ? parseFloat(st.borderRadius) : 0 };
      });
      deve(r.tot > 0, 'nessun pittogramma a schermo');
      deve(r.dentroPulsanti === 0, r.dentroPulsanti + ' pittogrammi dentro un pulsante');
      deve(r.dentroTabelle === 0, r.dentroTabelle + ' pittogrammi dentro una tabella');
      deve(r.dentroBadge === 0, r.dentroBadge + ' pittogrammi dentro una pastiglia di stato');
      deve(r.conPiuDiUno === 0, r.conPiuDiUno + ' schede con piu\' di un pittogramma');
      /* Il kit dice: contenitore 30-34 px, raggio massimo 8. Il riquadro di
         prima era 58 px con raggio 16: pesava piu' del nome del prodotto. */
      deve(r.lato >= 26 && r.lato <= 34, 'il contenitore misura ' + r.lato + 'px (attesi 26-34)');
      deve(r.raggio <= 8, 'il raggio e\' ' + r.raggio + 'px (massimo 8)');
      return r.tot + ' pittogrammi, ' + r.lato + 'px, raggio ' + r.raggio + 'px';
    });

    await prova('portafoglio: il pallino Pagamento si ricalcola dalle rate', async () => {
      /* Si potevano incassare TUTTE le rate di una polizza e vederla ancora
         rossa: due nostre pagine raccontavano fatti diversi sullo stesso
         contratto, e chi guarda non ha modo di sapere quale ha ragione. */
      const r = await page.evaluate(async () => {
        const esiti = {};
        const caso = async (nome, titoli) => {
          window.__COLLAUDO.db = [];
          window.__COLLAUDO.risposte['quote_titoli:lista'] = { data: titoli, error: null };
          const stato = await polRicalcolaPagamento('pol-1');
          const scritte = window.__COLLAUDO.db.filter(o => o.tabella === 'quote_polizze' && o.operazione === 'update');
          esiti[nome] = { stato, scritte: scritte.length, payload: scritte[0] && scritte[0].payload };
        };
        await caso('tutte incassate', [{ stato: 'incassato' }, { stato: 'incassato' }]);
        await caso('nessuna',         [{ stato: 'aperto' }, { stato: 'aperto' }]);
        await caso('a meta',          [{ stato: 'incassato' }, { stato: 'aperto' }]);
        /* Una rata annullata non conta: due incassate e una annullata fanno una
           polizza PAGATA, non una a meta'. */
        await caso('con annullata',   [{ stato: 'incassato' }, { stato: 'incassato' }, { stato: 'annullato' }]);
        /* Senza rate non si inventa uno stato: si lascia quello che c'era. */
        await caso('senza rate',      []);
        return esiti;
      });
      deve(r['tutte incassate'].stato === 'pagato', 'tutte incassate → ' + r['tutte incassate'].stato);
      deve(r['nessuna'].stato === 'non_pagato', 'nessuna incassata → ' + r['nessuna'].stato);
      deve(r['a meta'].stato === 'sospeso', 'a meta → ' + r['a meta'].stato);
      deve(r['con annullata'].stato === 'pagato', 'una rata annullata falsa il conto: ' + r['con annullata'].stato);
      deve(r['senza rate'].stato === null && r['senza rate'].scritte === 0,
        'senza rate inventa uno stato e lo scrive');
      deve(r['tutte incassate'].payload.stato_pagamento === 'pagato', 'scrive la colonna sbagliata');
      return 'cinque casi';
    });

    await prova('portafoglio: il numero di compagnia si puo\' finalmente inserire', async () => {
      /* La colonna esisteva, si leggeva in sei schermate e si esportava — ma
         nessuna riga di codice la scriveva. La tabella diceva «numero di
         compagnia da inserire» e non esisteva nessun posto dove inserirlo. */
      const r = await page.evaluate(async () => {
        window.__COLLAUDO.db = [];
        window.PF_ROWS_BACKUP = null;
        const vecchio = window.prompt;
        window.prompt = () => '  1234/AB  ';
        await polNumero('pol-9');
        const scritte = window.__COLLAUDO.db.filter(o => o.tabella === 'quote_polizze' && o.operazione === 'update');
        window.prompt = () => null;                    // annullato
        window.__COLLAUDO.db = [];
        await polNumero('pol-9');
        const dopoAnnulla = window.__COLLAUDO.db.filter(o => o.operazione === 'update').length;
        window.prompt = () => '   ';                   // svuotato
        window.__COLLAUDO.db = [];
        await polNumero('pol-9');
        const svuotato = window.__COLLAUDO.db.filter(o => o.tabella === 'quote_polizze')[0];
        window.prompt = vecchio;
        return { payload: scritte[0] && scritte[0].payload, dopoAnnulla, svuotato: svuotato && svuotato.payload };
      });
      deve(r.payload, 'non ha scritto niente');
      deve(r.payload.numero_polizza === '1234/AB', 'non ripulisce gli spazi: «' + r.payload.numero_polizza + '»');
      deve(r.dopoAnnulla === 0, 'annullando il prompt scrive lo stesso');
      deve(r.svuotato.numero_polizza === null,
        'un numero svuotato diventa stringa vuota invece di null: la ricerca «senza numero» ne troverebbe meta');
    });

    await prova('riapertura emissione: la polizza non resta orfana in portafoglio', async () => {
      /* Riaprire toglieva la spunta sul preventivo e basta: polizza e rate
         restavano vive in portafoglio, e le rate andavano a insoluto. */
      const r = await page.evaluate(async () => {
        window.__COLLAUDO.db = [];
        window.__COLLAUDO.risposte['quote_polizze:lista'] = { data: [{ id: 'pol-7', numero: 12 }], error: null };
        await annullaPolizzaDiPreventivo('prev-7', 'ROSSI MARIO');
        const pol = window.__COLLAUDO.db.filter(o => o.tabella === 'quote_polizze' && o.operazione === 'update');
        const tit = window.__COLLAUDO.db.filter(o => o.tabella === 'quote_titoli' && o.operazione === 'update');
        return { pol: pol[0] && pol[0].payload, tit: tit[0] && tit[0].payload, nTit: tit.length,
                 filtriTit: tit[0] && tit[0].filtri };
      });
      deve(r.pol && r.pol.stato_pagamento === 'annullata', 'la polizza non viene annullata: ' + JSON.stringify(r.pol));
      deve(r.nTit === 1 && r.tit.stato === 'annullato', 'le rate restano aperte e andranno a insoluto');
      /* Le rate gia' incassate NON si toccano: sono soldi entrati, e un incasso
         non si cancella perche' qualcuno riapre una pratica. */
      const src = await page.evaluate(() => {
        const f = String(window.annullaPolizzaDiPreventivo || annullaPolizzaDiPreventivo);
        return { neq: /neq\('stato',\s*'incassato'\)/.test(f), delete: /\.delete\(/.test(f) };
      });
      deve(src.neq, 'annulla anche le rate gia\' incassate: un incasso non si cancella');
      deve(!src.delete, 'CANCELLA invece di annullare: in un gestionale assicurativo la storia non si butta');
    });

    await prova('nessuna procedura crea piu\' clienti per conto suo', async () => {
      /* L'inserimento era copiato uguale in otto punti: e' cosi' che nascevano
         i doppioni. Se qualcuno lo ricopia, questa prova lo trova. */
      const copie = await page.evaluate(() => {
        const src = document.documentElement.outerHTML;
        return (src.match(/quote_anagrafiche'\)\.insert\(\{tipo:/g) || []).length;
      });
      deve(copie <= 1, 'ci sono ancora ' + copie + ' inserimenti diretti di anagrafica fuori da censisciCliente()');
    });

    await context.close();
  }

  /* ── La ricerca dalla scocca arriva davvero (punto 7) ───────────────────── */
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(initScript(true));
    await page.goto(BASE + '/index.html?page=anagrafiche&q=oddo', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    await prova('ricerca globale: il testo cercato arriva nel campo', async () => {
      const v = await page.evaluate(() => document.getElementById('anag-q')?.value);
      deve(v === 'oddo', 'nel campo c\'e\' «' + v + '» invece di «oddo»');
    });

    await prova('ricerca globale: si apre la pagina giusta', async () => {
      const attiva = await page.evaluate(() =>
        document.getElementById('page-anagrafiche')?.classList.contains('active') ||
        getComputedStyle(document.getElementById('page-anagrafiche')).display !== 'none');
      deve(attiva, 'la pagina Anagrafiche non e\' quella aperta');
    });

    await context.close();
  }

  /* ── Cattura API: niente piu' addestramento al self-XSS ─────────────────
     Segnalazione di sicurezza del collaudo esterno (30/07/2026). Il problema
     non era lo script, era la PROCEDURA: «apri la console, scrivi allow
     pasting, incolla questo». Quel messaggio di Chrome esiste per fermare una
     truffa; insegnarne l'aggiramento come routine addestra a caderci. */
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(initScript(true));
    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    await prova('cattura: la console non e\' piu\' la procedura', async () => {
      /* Si guarda il testo VISIBILE, non i commenti del codice: e' quello che
         legge l'operatore. */
      const testo = await page.evaluate(() => {
        const el = document.getElementById('page-fonti');
        return el ? (el.textContent || '') : '';
      });
      deve(!/allow pasting/i.test(testo), 'la pagina insegna ancora ad aggirare l\'avviso di Chrome');
      deve(!/F12/.test(testo), 'la pagina indirizza ancora alla console del browser');
    });

    await prova('cattura: c\'e\' il segnalibro da trascinare', async () => {
      const r = await page.evaluate(() => {
        if (typeof riquadroSegnalibro !== 'function') return { err: 'manca riquadroSegnalibro' };
        const d = document.createElement('div');
        d.innerHTML = riquadroSegnalibro('(function(){return 1})()', 'Prova');
        const a = d.querySelector('a[href^="javascript:"]');
        return { c: !!a, testo: d.textContent, href: a ? a.getAttribute('href').slice(0, 30) : '' };
      });
      deve(!r.err, r.err);
      deve(r.c, 'non produce un segnalibro trascinabile');
      deve(/preferiti/i.test(r.testo), 'non spiega che va trascinato nei preferiti');
    });

    await prova('cattura: il segnalibro contiene davvero lo script', async () => {
      const ok = await page.evaluate(() => {
        const href = segnalibroDa(UNIVERSAL_CAPTURE_JS);
        const dentro = decodeURIComponent(href.replace(/^javascript:/, ''));
        return dentro.indexOf('__capRec') >= 0 && dentro.indexOf('REC API') >= 0;
      });
      deve(ok, 'il segnalibro non porta lo script di cattura');
    });

    await prova('cattura: avvisa che nessuno chiedera\' mai di incollare in console', async () => {
      const t = await page.evaluate(() => {
        const d = document.createElement('div');
        d.innerHTML = riquadroSegnalibro('(function(){})()', 'x');
        return d.textContent;
      });
      deve(/mai di incollare/i.test(t) && /truffa/i.test(t),
        'manca l\'avviso che insegna il riflesso giusto: ' + t.slice(0, 120));
    });

    await prova('cattura: avverte che il file contiene dati dei clienti', async () => {
      const t = await page.evaluate(() => {
        const d = document.createElement('div');
        d.innerHTML = riquadroSegnalibro('(function(){})()', 'x');
        return d.textContent;
      });
      deve(/dati dei clienti/i.test(t), 'non avverte sul contenuto del file catturato');
    });

    await prova('cattura: cliccarlo dentro QUOTO non lo esegue', async () => {
      const r = await page.evaluate(() => {
        const d = document.createElement('div');
        d.innerHTML = riquadroSegnalibro('(function(){window.__ESEGUITO=1})()', 'x');
        const a = d.querySelector('a');
        return { onclick: a.getAttribute('onclick') || '' };
      });
      deve(/segnalibroNonCliccare/.test(r.onclick),
        'un clic dentro QUOTO registrerebbe le chiamate di QUOTO, non del portale');
    });

    await context.close();
  }

  /* ── Importi: un solo modo di scriverli (punti 15 e 16) ──────────────────── */
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(initScript(true));
    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    await prova('importi: virgola per i decimali, punto per le migliaia', async () => {
      const r = await page.evaluate(() => ({
        mille: soldi(1466), spicci: soldi(807), tondo: soldi(230.58), zero: soldi(0)
      }));
      deve(r.mille === '€ 1.466,00', 'mille euro: «' + r.mille + '»');
      deve(r.spicci === '€ 807,00', 'ottocentosette: «' + r.spicci + '»');
      deve(r.tondo === '€ 230,58', 'con i centesimi: «' + r.tondo + '»');
      deve(r.zero === '€ 0,00', 'zero e\' un dato, non un dato mancante: «' + r.zero + '»');
    });

    await prova('importi: niente punto al posto della virgola, mai', async () => {
      const v = await page.evaluate(() => soldi(807));
      deve(!/807\.00/.test(v), '«' + v + '» si legge come ottocentosette centesimi');
    });

    await prova('importi: un valore che non e\' un numero non diventa zero', async () => {
      const r = await page.evaluate(() => ({ nulla: soldi(null), testo: soldi('boh') }));
      deve(r.nulla === '—' && r.testo === '—', 'inventa uno zero: ' + JSON.stringify(r));
    });

    await prova('importi: il formattatore di casa usa lo stesso numero', async () => {
      /* euro() mette il simbolo dopo, soldi() prima: cambia il simbolo, non il
         numero. Se divergessero tornerebbe il problema di partenza. */
      const r = await page.evaluate(() => ({ a: euro(1466), b: soldi(1466) }));
      const numA = String(r.a).replace(/[^\d.,]/g, '').trim();
      const numB = String(r.b).replace(/[^\d.,]/g, '').trim();
      deve(numA === numB, 'due numeri diversi: euro()=«' + r.a + '» soldi()=«' + r.b + '»');
    });

    await prova('importi: nessun toFixed(2) attaccato a un euro', async () => {
      const quanti = await page.evaluate(() => {
        const src = document.documentElement.outerHTML;
        return (src.match(/€[^<>\n]{0,12}toFixed\(2\)/g) || []).length;
      });
      deve(quanti === 0, 'restano ' + quanti + ' importi scritti col punto');
    });

    await prova('la colonna Premio non spezza il simbolo dalla cifra', async () => {
      const r = await page.evaluate(() => {
        const th = [...document.querySelectorAll('th')].filter(x => /premio/i.test(x.textContent));
        const conClasse = th.filter(x => x.classList.contains('soldi')).length;
        const st = [...document.styleSheets].some(f => { try {
          return [...f.cssRules].some(x => /\.storico-table td\.soldi/.test(x.cssText) && /nowrap/.test(x.cssText));
        } catch (e) { return false; } });
        return { th: th.length, conClasse, regola: st };
      });
      deve(r.th > 0 && r.conClasse === r.th, r.conClasse + ' colonne Premio su ' + r.th + ' sono marcate');
      deve(r.regola, 'manca la regola che impedisce di andare a capo');
    });

    await context.close();
  }

  /* ══ CENSIMENTO ANAGRAFICA ════════════════════════════════════════════════
     Una prova per ciascuno dei nove criteri di accettazione della specifica
     presa dal portale Plurima il 03/08/2026. I numeri qui sotto sono i suoi.
     ════════════════════════════════════════════════════════════════════════ */
  {
    const context = await browser.newContext();
    await bloccaRete(context);
    const page = await context.newPage();
    await page.addInitScript(initScript(true));
    const erroriAna = [];
    sorvegliaErrori(page, erroriAna);
    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    // Due anagrafiche finte in archivio. L'elenco dei comuni non arriva dalla
    // rete (e' bloccata): lo metto a mano, cosi' la cascata prova la MIA logica
    // e non la disponibilita' di un CDN.
    const semina = async (righe) => {
      await page.evaluate((r) => { window.__COLLAUDO.risposte['quote_anagrafiche:lista'] = { data: r, error: null }; }, righe);
    };
    const ARCHIVIO = [
      { id: 'cli-1', tipo: 'fisica', nominativo: 'ROSSI MARIO', cognome: 'Rossi', nome: 'Mario',
        codice_fiscale: 'RSSMRA80A01H501U', indirizzo: 'Via Roma', civico: '1', cap: '00185',
        comune: 'Roma', provincia: 'RM', indirizzo_certificato: true },
      { id: 'cli-2', tipo: 'giuridica', nominativo: 'ACME SRL', ragione_sociale: 'Acme Srl',
        partita_iva: '00743110157', codice_fiscale: '00743110157' }
    ];
    await page.evaluate(() => {
      COMUNI = [
        { nome: 'Roma', sigla: 'RM', cap: ['00118', '00185'], codiceCatastale: 'H501' },
        { nome: 'Torino', sigla: 'TO', cap: ['10121', '10122'], codiceCatastale: 'L219' },
        { nome: 'Chieri', sigla: 'TO', cap: ['10023'], codiceCatastale: 'C627' }
      ];
    });

    await semina(ARCHIVIO);
    await page.evaluate(() => openAnagrafica());
    await page.waitForTimeout(400);

    // ── Criterio 1 ───────────────────────────────────────────────────────────
    await prova('anagrafica 1: senza una scelta non si va avanti', async () => {
      const r = await page.evaluate(() => {
        const sel = document.getElementById('ana-sel');
        sel.value = ''; anaScelta();
        return { usa: document.getElementById('ana-btn-usa').disabled,
                 vis: document.getElementById('ana-btn-vis').disabled,
                 opzioni: sel.options.length };
      });
      deve(r.opzioni === 2, 'l\'elenco non mostra le anagrafiche in archivio: ' + r.opzioni);
      deve(r.usa, 'si puo\' proseguire senza aver scelto nessuno');
      deve(r.vis, '«Visualizza» e\' premibile senza una selezione');
    });

    // ── Criterio 2 ───────────────────────────────────────────────────────────
    await prova('anagrafica 2: «Aggiungi» apre la ricerca, «Torna indietro» non perde la scelta', async () => {
      const r = await page.evaluate(() => {
        const sel = document.getElementById('ana-sel');
        sel.value = 'cli-1'; anaScelta();
        const primaDi = ANA.scelta;
        anaApriRicerca();
        const inRicerca = document.getElementById('ana-vista-ricerca').style.display !== 'none'
                       && document.getElementById('ana-vista-scelta').style.display === 'none';
        anaTornaIndietro();
        return { primaDi, inRicerca, dopo: ANA.scelta,
                 tornato: document.getElementById('ana-vista-scelta').style.display !== 'none',
                 selezione: document.getElementById('ana-sel').value };
      });
      deve(r.inRicerca, '«Aggiungi» non apre la schermata di ricerca');
      deve(r.tornato, '«Torna indietro» non riporta alla scelta');
      deve(r.dopo === r.primaDi && r.selezione === 'cli-1',
        'la selezione di prima e\' andata persa: era ' + r.primaDi + ', adesso ' + r.dopo);
    });

    // ── Criterio 3 — il motivo per cui tutto questo esiste ───────────────────
    await prova('anagrafica 3: un codice fiscale gia\' censito precompila, non duplica', async () => {
      await page.evaluate(() => { window.__COLLAUDO.db = []; });
      await semina([ARCHIVIO[0]]);
      await page.evaluate(() => {
        anaApriRicerca();
        document.getElementById('ana-q-id').value = 'RSSMRA80A01H501U';
        return anaCercaPerId();
      });
      await page.waitForTimeout(900);
      const r = await page.evaluate(() => ({
        vista: ANA.vista, id: ANA.id,
        cognome: document.getElementById('ans-cognome').value,
        cf: document.getElementById('ans-codice_fiscale').value,
        scritture: window.__COLLAUDO.db.filter(x => x.tabella === 'quote_anagrafiche' && x.operazione === 'insert').length
      }));
      deve(r.vista === 'scheda', 'non ha aperto la scheda');
      deve(r.id === 'cli-1', 'la scheda non e\' agganciata al record esistente (id: ' + r.id + ')');
      deve(r.cognome === 'Rossi' && r.cf === 'RSSMRA80A01H501U', 'la scheda non e\' precompilata');
      deve(r.scritture === 0, 'ha creato un doppione invece di riaprire quello che c\'era');
    });

    // ── Criterio 4 ───────────────────────────────────────────────────────────
    await prova('anagrafica 4: la partita IVA fa comparire ragione sociale, forfettario e SDI', async () => {
      const r = await page.evaluate(() => {
        const vis = () => [...document.querySelectorAll('#ana-vista-scheda .solo-piva')]
          .every(e => e.style.display !== 'none');
        const nas = () => [...document.querySelectorAll('#ana-vista-scheda .solo-piva')]
          .every(e => e.style.display === 'none');
        const p = document.getElementById('ans-partita_iva');
        p.value = '00743110157'; anaCambiato();
        const conPiva = vis();
        document.getElementById('ans-ragione_sociale').value = 'Acme Srl';
        document.getElementById('ans-sdi').value = 'ABC1234';
        document.getElementById('ans-regime_forfettario').value = '1';
        const campi = document.querySelectorAll('#ana-vista-scheda .solo-piva').length;
        p.value = ''; anaCambiato();
        const senzaPiva = nas();
        const d = anaLeggiScheda();
        return { conPiva, senzaPiva, campi, rs: d.ragione_sociale, sdi: d.sdi, rf: d.regime_forfettario };
      });
      deve(r.campi === 3, 'i campi legati alla partita IVA sono ' + r.campi + ', attesi 3');
      deve(r.conPiva, 'con la partita IVA i tre campi non compaiono');
      deve(r.senzaPiva, 'togliendo la partita IVA i tre campi restano visibili');
      deve(r.rs === '' && r.sdi === '' && r.rf === null,
        'i valori partono lo stesso: ' + JSON.stringify(r));
    });

    // ── Criterio 5 ───────────────────────────────────────────────────────────
    await prova('anagrafica 5: senza i dati obbligatori (o con un CF sbagliato) non si salva', async () => {
      const r = await page.evaluate(() => {
        const base = { tipologia_contraente: 'fisico', indirizzo: { via: 'Via Roma', certificato: true } };
        const buono = { ...base, codice_fiscale: 'RSSMRA80A01H501U', cognome: 'Rossi', nome: 'Mario' };
        return {
          senzaCf:    anaValida({ ...buono, codice_fiscale: '' }).length,
          cfStorto:   anaValida({ ...buono, codice_fiscale: 'RSSMRA80A01H501X' }).length,
          senzaCogn:  anaValida({ ...buono, cognome: '' }).length,
          senzaNome:  anaValida({ ...buono, nome: '' }).length,
          senzaIndir: anaValida({ ...buono, indirizzo: { via: '', certificato: false } }).length,
          completo:   anaValida(buono).length
        };
      });
      deve(r.completo === 0, 'una scheda completa viene rifiutata lo stesso');
      for (const k of ['senzaCf', 'cfStorto', 'senzaCogn', 'senzaNome', 'senzaIndir'])
        deve(r[k] > 0, k + ': passa il salvataggio');
    });

    // ── Criterio 6 ───────────────────────────────────────────────────────────
    await prova('anagrafica 6: con partita IVA serve la PEC oppure lo SDI', async () => {
      const r = await page.evaluate(() => {
        const b = { codice_fiscale: 'RSSMRA80A01H501U', cognome: 'Rossi', nome: 'Mario',
                    tipologia_contraente: 'giuridico', ragione_sociale: 'Acme Srl',
                    partita_iva: '00743110157', indirizzo: { via: 'Via Roma', certificato: true } };
        const dice = (d) => anaValida(d).filter(p => /PEC/.test(p)).length;
        return { nessuno: dice(b), soloPec: dice({ ...b, pec: 'a@pec.it' }),
                 soloSdi: dice({ ...b, sdi: 'ABC1234' }),
                 sdiCorto: anaValida({ ...b, sdi: 'ABC' }).filter(p => /SDI/.test(p)).length,
                 fisicaSenzaNulla: dice({ ...b, partita_iva: '', ragione_sociale: '' }) };
      });
      deve(r.nessuno > 0, 'un soggetto con partita IVA si salva senza PEC ne\' SDI');
      deve(r.soloPec === 0, 'la sola PEC non basta, e invece deve bastare');
      deve(r.soloSdi === 0, 'il solo SDI non basta, e invece deve bastare');
      deve(r.sdiCorto > 0, 'accetta un codice SDI che non e\' di 7 caratteri');
      deve(r.fisicaSenzaNulla === 0, 'lo chiede anche a una persona fisica, che non deve');
    });

    // ── Criterio 7 ───────────────────────────────────────────────────────────
    await prova('anagrafica 7: un indirizzo non certificato avvisa e si conferma solo dalla finestra', async () => {
      const r = await page.evaluate(async () => {
        // scritto a mano: si scertifica
        document.getElementById('ans-indirizzo').value = 'Via Inventata';
        document.getElementById('ans-certificato').value = '1';
        anaIndirizzoScritto('Via Inventata 9');
        const avvisoVisibile = document.getElementById('ans-avviso-indirizzo').style.display !== 'none';
        const bloccato = anaValida({ codice_fiscale: 'RSSMRA80A01H501U', cognome: 'R', nome: 'M',
          tipologia_contraente: 'fisico', indirizzo: { via: 'Via Inventata', certificato: false } })
          .filter(p => /certificat/i.test(p)).length;

        // la finestra manuale: cascata Provincia → Comune → CAP, da ferma.
        // (Su un indirizzo che ha gia' la provincia il comune si apre subito, ed
        //  e' giusto cosi': e' il precompilato. Qui si prova il caso vuoto.)
        ['ans-provincia','ans-comune','ans-cap'].forEach(id => { document.getElementById(id).value = ''; });
        anaApriIndirizzoManuale();
        const provOpzioni = document.getElementById('anm-provincia').options.length;
        const provAttese = PROVINCE.length + 1;   // le sigle vere + la voce vuota
        const comuneChiusoPrima = document.getElementById('anm-comune').disabled;
        document.getElementById('anm-provincia').value = 'TO';
        await anaModaleComuni();
        const comuni = [...document.getElementById('anm-comune').options].map(o => o.value).filter(Boolean);
        const capChiusoPrima = document.getElementById('anm-cap').disabled;
        document.getElementById('anm-comune').value = 'Chieri';
        await anaModaleCap();
        const caps = [...document.getElementById('anm-cap').options].map(o => o.value).filter(Boolean);
        document.getElementById('anm-indirizzo').value = 'Via Vittorio Emanuele';
        document.getElementById('anm-civico').value = '12';
        anaModaleRiepilogo();
        const confermabile = !document.getElementById('anm-conferma').disabled;
        const riepilogo = document.getElementById('anm-riepilogo').textContent;
        anaConfermaIndirizzoManuale();
        return { avvisoVisibile, bloccato, provOpzioni, provAttese, comuneChiusoPrima, comuni, capChiusoPrima, caps,
                 confermabile, riepilogo,
                 dopo: anaIndirizzoStrutturato(),
                 avvisoDopo: document.getElementById('ans-avviso-indirizzo').style.display !== 'none',
                 finestraChiusa: document.getElementById('ana-modale-indirizzo').style.display === 'none' };
      });
      deve(r.avvisoVisibile, 'scrivendo a mano non compare l\'avviso «indirizzo non certificato»');
      deve(r.bloccato > 0, 'un indirizzo non certificato passa il salvataggio');
      deve(r.provOpzioni === r.provAttese, 'le province in tendina sono ' + r.provOpzioni + ', le sigle note ' + (r.provAttese - 1));
      deve(r.comuneChiusoPrima && r.capChiusoPrima, 'la cascata non è a cascata: comune o CAP aperti prima');
      deve(r.comuni.join(',') === 'Chieri,Torino', 'i comuni di TO sono: ' + r.comuni.join(','));
      deve(r.caps.join(',') === '10023', 'i CAP di Chieri sono: «' + r.caps.join(',') + '» (la lista, non le lettere)');
      deve(r.confermabile, 'con tutti i campi pieni non si può confermare');
      deve(/Chieri/.test(r.riepilogo) && /10023/.test(r.riepilogo), 'il riepilogo non si compone: «' + r.riepilogo + '»');
      deve(r.dopo.certificato === true, 'confermare dalla finestra non certifica l\'indirizzo');
      deve(r.dopo.comune === 'Chieri' && r.dopo.cap === '10023' && r.dopo.provincia === 'TO',
        'l\'indirizzo non torna in forma strutturata: ' + JSON.stringify(r.dopo));
      deve(!r.avvisoDopo, 'l\'avviso resta acceso anche dopo la conferma');
      deve(r.finestraChiusa, 'la finestra non si chiude dopo la conferma');
    });

    // ── Criterio 8 ───────────────────────────────────────────────────────────
    await prova('anagrafica 8: dopo il salvataggio l\'anagrafica risulta scelta e si prosegue', async () => {
      await page.evaluate(() => { window.__COLLAUDO.db = []; });
      await semina([]);   // nessuno in archivio: e' una creazione vera
      await page.evaluate(async () => {
        anaApriScheda(anaSchedaVuota());
        const v = (id, val) => { document.getElementById(id).value = val; };
        v('ans-codice_fiscale', 'RSSMRA80A01H501U'); v('ans-cognome', 'Rossi'); v('ans-nome', 'Mario');
        v('ans-indirizzo', 'Via Roma'); v('ans-civico', '1'); v('ans-cap', '00185');
        v('ans-comune', 'Roma'); v('ans-provincia', 'RM'); v('ans-certificato', '1');
        anaTipologia('fisico');
        await anaSalvaEProsegui();
      });
      await page.waitForTimeout(700);
      const r = await page.evaluate(() => {
        const scritture = window.__COLLAUDO.db.filter(x => x.tabella === 'quote_anagrafiche');
        return { errori: document.getElementById('ans-errori').style.display,
                 inserimenti: scritture.filter(x => x.operazione === 'insert').length,
                 payload: (scritture.find(x => x.operazione === 'insert') || {}).payload,
                 scelta: ANA.scelta, cliente: flowCtx.clienteId,
                 selezionata: document.getElementById('ana-sel').value,
                 confermato: document.getElementById('ana-ok').style.display };
      });
      deve(r.errori === 'none', 'il salvataggio si è fermato su un errore');
      deve(r.inserimenti === 1, 'inserimenti: ' + r.inserimenti + ' (atteso 1)');
      deve(r.payload && r.payload.indirizzo_certificato === true,
        'l\'indirizzo non viene salvato come certificato: ' + JSON.stringify(r.payload));
      deve(r.payload.nominativo === 'ROSSI MARIO', 'nominativo composto male: ' + r.payload.nominativo);
      deve(r.cliente === 'nuovo-quote_anagrafiche', 'il preventivo non resta agganciato al cliente salvato');
      deve(r.scelta === r.cliente, 'l\'anagrafica salvata non risulta quella scelta');
      deve(r.confermato === 'block', 'non conferma che ha salvato');
    });

    // ── Criterio 9 ───────────────────────────────────────────────────────────
    await prova('anagrafica 9: ordine e larghezze dei campi, e una colonna sola sul telefono', async () => {
      const attesi = [
        ['ans-codice_fiscale', 3], ['ans-cognome', 3], ['ans-nome', 3], ['ans-condizione_lavorativa', 3],
        ['ans-partita_iva', 3], ['ans-ragione_sociale', 9], ['ans-regime_forfettario', 3],
        ['ans-fatt_partita_iva', 3], ['ans-fatt_codice_fiscale', 3], ['ans-fatt_ragione_sociale', 6],
        ['ans-pec', 3], ['ans-sdi', 3]
      ];
      const r = await page.evaluate((att) => {
        /* La misura va presa a schermata VISIBILE: su un elemento nascosto il
           browser restituisce il valore scritto nel foglio di stile, non
           quello calcolato, e «repeat(12, 1fr)» conterebbe due colonne. */
        openAnagrafica(); anaApriScheda(anaSchedaVuota());
        const griglia = document.querySelector('#ana-vista-scheda .ana-griglia');
        const ordine = [...griglia.querySelectorAll('input,select')].map(e => e.id);
        const largh = att.map(([id, c]) => {
          const box = document.getElementById(id).closest('.ana-g');
          return { id, atteso: c, ha: box.classList.contains('c' + c) };
        });
        return { ordine, largh, colonne: getComputedStyle(griglia).gridTemplateColumns.split(' ').length };
      }, attesi);
      deve(r.colonne === 12, 'la griglia non è a 12 colonne ma a ' + r.colonne);
      const sbagliate = r.largh.filter(x => !x.ha).map(x => x.id + '≠c' + x.atteso);
      deve(!sbagliate.length, 'larghezze sbagliate: ' + sbagliate.join(', '));
      // l'ordine dichiarato dalla specifica dev'essere quello del documento
      const soloNoti = r.ordine.filter(id => attesi.some(([a]) => a === id));
      deve(soloNoti.join('>') === attesi.map(([a]) => a).join('>'),
        'i campi non sono nell\'ordine della specifica: ' + soloNoti.join(' > '));

      await page.setViewportSize({ width: 390, height: 820 });
      const stretti = await page.evaluate(() => {
        const g = document.querySelector('#ana-vista-scheda .ana-griglia');
        const colonne = getComputedStyle(g).gridTemplateColumns.split(' ').length;
        const box = document.getElementById('ans-cognome').closest('.ana-g');
        const start = getComputedStyle(box).gridColumnStart;   // «span 12» sta qui, non nell'end
        return { colonne, start };
      });
      await page.setViewportSize({ width: 1280, height: 900 });
      deve(stretti.start === 'span 12', 'sul telefono un campo da 3 colonne non prende tutta la riga: ' + stretti.start);
      return attesi.length + ' campi, ordine e larghezze come da specifica';
    });

    await prova('anagrafica: nessun errore JavaScript in tutto lo step', async () => {
      deve(erroriAna.length === 0, erroriAna.slice(0, 3).join(' | '));
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
