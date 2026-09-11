// ─────────────────────────────────────────────────────────────────────────────
// IL BANCO DI PROVA DELLE SUITE CON IL BROWSER
//
// L'app aperta in un Chromium, con login SIMULATO e Supabase/API FINTI: nessuna
// chiamata esce verso la produzione, e nessun dato di collaudo finisce in
// archivio.
//
// PERCHE' STA IN UN FILE SUO. Fino all'11/09/2026 viveva dentro ui-test.mjs.
// La seconda suite che ne aveva bisogno (ui-test-previdenza.mjs) avrebbe dovuto
// copiarselo — e da quel momento sarebbero stati DUE finti Supabase da tenere
// allineati a mano. Un finto che si scorda un metodo non rompe la prova: la fa
// passare su una pagina che funziona a meta', oppure — peggio — lascia uscire
// una chiamata vera verso la produzione, che e' esattamente la cosa che questo
// codice esiste per impedire. Uno solo, in un posto solo.
//
// Chi aggiunge una suite importa da qui:
//   import { BASE, nuovaPagina } from './ui-collaudo.mjs';
// ─────────────────────────────────────────────────────────────────────────────

export const BASE = process.env.COLLAUDO_BASE || 'http://127.0.0.1:8077';

/* ── il finto Supabase (iniettato PRIMA di ogni script della pagina) ───────── */
// La sessione simulata usa l'email del super admin: così si vede l'app completa
// (tutte le voci di navigazione, incluso il pannello Fonti).
export function initScript(conSessione) {
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
export async function bloccaRete(context) {
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(BASE)) return route.continue();      // file locali: veri
    // tutto il resto (CDN, API, Supabase) riceve una risposta finta e innocua
    if (/\.css(\?|$)/.test(url)) return route.fulfill({ status: 200, contentType: 'text/css', body: '/* collaudo */' });
    if (/\.m?js(\?|$)|jsdelivr|unpkg|cdn/.test(url)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* collaudo */' });
    if (/\.(png|jpe?g|gif|svg|ico|woff2?)(\?|$)/.test(url)) return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.alloc(0) });
    /* I NUMERI DI LEGGE, come li servirebbe il server vero. Dal 05/09/2026 il
       modulo previdenziale senza parametri NON CALCOLA: risponderle `{}` come
       a tutto il resto vorrebbe dire collaudare per sempre la schermata
       bloccata, e non quella che il consulente usa. La strada senza parametri
       ha la sua prova, che se li nega da sé. */
    if (/parametri-previdenziali\/numeri/.test(url)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        ok: true,
        numeri: { tetto_deducibilita: 5164.57, tassazione_rendimenti: { generale: 0.20 },
                  inflazione_attesa: 0.02, crescita_reale_reddito: 0.01, crescita_reale_pil: 0.006,
                  __fonti: {}, __daConfermare: {} },
        coefficienti: { biennio: 'in vigore fino al 31/12/2026', daVerificare: false, avvisi: [],
                        fonte: 'Decreto 20/11/2024', perEta: { 64: 0.05231, 65: 0.05323, 66: 0.05423, 67: 0.05608, 68: 0.05811, 69: 0.06034, 70: 0.06283 } },
        decadimento: null, requisitiProiettati: null, avvisi: [],
      }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

/* ── raccolta errori JavaScript della pagina ───────────────────────────────── */
export function sorvegliaErrori(page, sacco) {
  page.on('pageerror', (e) => sacco.push('pageerror: ' + (e && e.message || e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text() || '';
    if (/Failed to load resource|net::|ERR_/.test(t)) return; // rumore di rete, non errori del codice
    sacco.push('console: ' + t);
  });
}

/* `viewport` serve alle prove sul telefono: il preventivatore si usa in piedi
   davanti a un cliente, e quello che si rompe a 390 px non si vede a 1280. */
export async function nuovaPagina(browser, { sessione, url, viewport }) {
  const context = await browser.newContext(viewport ? { viewport } : {});
  await bloccaRete(context);
  const page = await context.newPage();
  await page.addInitScript(initScript(sessione));
  const errori = [];
  sorvegliaErrori(page, errori);
  await page.goto(url, { waitUntil: 'load' });
  return { context, page, errori };
}
