// ─────────────────────────────────────────────────────────────────────────────
// COLLAUDO DEL MODULO DI CANDIDATURA — con un browser vero
//
// Il 10/09/2026 le tre scelte «Sei iscritto al RUI?» erano <div>. Il radio
// vero sta sotto, invisibile (opacity:0, 1px), e il riquadro che si vede e'
// uno <span>: un <div> non gli inoltra il clic. Chi apriva il modulo dal
// telefono ci toccava sopra, selezionava il testo e si prendeva «Scegli una
// delle tre» senza avere modo di sceglierne una. Il modulo pubblico era
// inutilizzabile, e nessuna prova se n'era accorta: sul server la richiesta
// non arrivava proprio.
//
// Nessuna prova sulla forma del codice l'avrebbe visto — la marcatura era
// valida, il CSS era valido, il JavaScript era giusto. Serviva un clic vero,
// ed e' quello che c'e' qui dentro: Chromium, la pagina come la riceve chi si
// candida, e il puntatore sul testo del riquadro.
//
//   node static-server.js &            # serve il repo sulla 8077
//   node ui-test-candidatura.mjs       # richiede: npm i --no-save playwright
//
// Se sulla macchina c'e' gia' un Chromium (per esempio quello di sistema, o
// uno scaricato da una versione diversa di Playwright), lo si indica con
// CHROMIUM=/percorso/al/chrome invece di riscaricarlo.
//
// L'informativa e l'elenco dei comuni si sostituiscono qui, e ogni altra
// uscita verso la rete viene tappata: la pagina non deve chiamare la
// produzione per essere collaudata, e la candidatura finta non deve finire in
// archivio.
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8077';
const PAGINA = BASE + '/candidatura.html';

const esiti = [];
async function prova(nome, fn) {
  try { const m = await fn(); esiti.push([true, nome, m || '']); }
  catch (e) { esiti.push([false, nome, (e && e.message) || String(e)]); }
}
function deve(c, msg) { if (!c) throw new Error(msg); }

const INFORMATIVA = {
  versione: '2026-09',
  hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  testo: '## Chi tratta i tuoi dati\nWithus Assicurazioni.',
};
const COMUNI = [
  { nome: 'Paceco', sigla: 'TP' },
  { nome: 'Palermo', sigla: 'PA' },
  { nome: 'Trapani', sigla: 'TP' },
];

/* Apre la pagina con la rete finta. `inviate` raccoglie le POST: serve a
   provare che una candidatura parte davvero, e con dentro la scelta fatta. */
async function apri(browser, { larghezza = 1280, altezza = 900, tocco = false } = {}) {
  const context = await browser.newContext({
    viewport: { width: larghezza, height: altezza },
    hasTouch: tocco, isMobile: tocco,
  });
  const page = await context.newPage();
  const errori = [];
  const inviate = [];
  page.on('pageerror', e => errori.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errori.push(m.text()); });

  /* Le rotte si consultano dall'ultima registrata alla prima: il tappo a
     qualunque uscita verso la rete va messo per PRIMO, altrimenti si mangia
     anche le tre sostituzioni qui sotto e la pagina resta ad aspettare
     l'informativa per sempre. */
  const tappate = [];
  await page.route('**/*', r => {
    if (new URL(r.request().url()).hostname === '127.0.0.1') return r.continue();
    /* Si risponde vuoto invece di chiudere di netto: un `abort` lascia in
       console un ERR_FAILED, e coprirebbe gli errori veri della pagina. */
    tappate.push(r.request().url());
    return r.fulfill({ status: 200, contentType: 'text/plain', body: '' });
  });
  await page.route('**/comuni-json**', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(COMUNI) }));
  await page.route('**/candidature/informativa', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(INFORMATIVA) }));
  await page.route('**/candidature', async (r) => {
    inviate.push(JSON.parse(r.request().postData() || '{}'));
    await r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });

  await page.goto(PAGINA, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('vers-etichetta').textContent !== '—');
  return { context, page, errori, inviate, tappate };
}

/* Compila tutto tranne la scelta RUI: il comune passa dall'elenco, perche' la
   provincia si compila solo scegliendo una voce. */
async function compila(page) {
  await page.fill('#nome', 'Salvatore');
  await page.fill('#cognome', 'Randazzo');
  await page.fill('#email', 's.randazzo@email.it');
  await page.fill('#telefono', '333 4187260');
  await page.fill('#comune', 'Pace');
  await page.click('#com-res .geo-item');
  await page.check('#privacy');
}

const avvio = async () => {
  const browser = await chromium.launch(
    process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

  /* ── 1. il difetto ──────────────────────────────────────────────────────── */

  for (const [id, valore, etichetta] of [
    ['rui-e', 'E', 'Sì, sezione E'],
    ['rui-altra', 'altra', 'Sì, altra sezione'],
    ['rui-no', 'no', 'Non ancora'],
  ]) {
    await prova('si sceglie «' + etichetta + '» cliccandoci sopra', async () => {
      const { context, page } = await apri(browser);
      /* Si clicca lo <span>, cioe' il riquadro che si vede: e' li' che va il
         dito. Non `check()`, che parla direttamente al radio nascosto e
         sarebbe passata anche col <div>. */
      await page.click('#' + id + ' + span');
      const scelto = await page.evaluate(() =>
        (document.querySelector('input[name="rui_stato"]:checked') || {}).value || null);
      deve(scelto === valore, 'il clic non arriva al radio: scelto ' + scelto);
      await context.close();
    });
  }

  await prova('e la scelta si vede, non resta solo nei dati', async () => {
    const { context, page } = await apri(browser);
    const colore = () => page.evaluate(() =>
      getComputedStyle(document.querySelector('#rui-e + span')).borderTopColor);
    const prima = await colore();
    await page.click('#rui-e + span');
    /* Il riquadro ha `transition:.12s`: letto subito, il colore e' ancora
       quello di partenza a meta' animazione. Si aspetta che si fermi. */
    await page.waitForFunction((c) =>
      getComputedStyle(document.querySelector('#rui-e + span')).borderTopColor !== c, prima,
      { timeout: 3000 }).catch(() => {});
    const dopo = await colore();
    deve(prima !== dopo, 'il riquadro scelto resta identico agli altri due: ' + dopo);
    deve(await page.evaluate(() =>
      getComputedStyle(document.querySelector('#rui-altra + span')).borderTopColor) === prima,
      'si sono accesi anche gli altri due riquadri');
    await context.close();
  });

  await prova('col dito, sullo schermo di un telefono', async () => {
    /* E' il caso vero: la segnalazione e' arrivata da un telefono. */
    const { context, page } = await apri(browser, { larghezza: 390, altezza: 820, tocco: true });
    await page.tap('#rui-no + span');
    const scelto = await page.evaluate(() =>
      (document.querySelector('input[name="rui_stato"]:checked') || {}).value || null);
    deve(scelto === 'no', 'al tocco la scelta non si spunta: ' + scelto);
    await context.close();
  });

  /* ── 2. cosa ne consegue nel modulo ─────────────────────────────────────── */

  await prova('scegliendo una sezione compare il campo del numero RUI', async () => {
    const { context, page } = await apri(browser);
    deve(await page.isHidden('#r-rui'), 'la riga del numero RUI si vede prima della scelta');
    await page.click('#rui-e + span');
    deve(await page.isVisible('#r-rui'), 'scelta la sezione E, il numero RUI non viene chiesto');
    await page.click('#rui-no + span');
    deve(await page.isHidden('#r-rui'), 'a chi non e\' iscritto si chiede lo stesso il numero');
    await context.close();
  });

  await prova('«Scegli una delle tre» compare e poi si toglie', async () => {
    const { context, page } = await apri(browser);
    await compila(page);
    await page.click('#invia');
    deve(await page.isVisible('#e-sezione'), 'senza scelta il modulo parte lo stesso');
    await page.click('#rui-no + span');
    await page.click('#invia');
    deve(await page.isHidden('#e-sezione'),
      'l\'errore resta anche dopo aver scelto: e\' quello che vedeva chi si candidava');
    await context.close();
  });

  await prova('e la candidatura parte, con dentro la scelta fatta', async () => {
    const { context, page, inviate } = await apri(browser);
    await compila(page);
    await page.click('#rui-e + span');
    await page.fill('#rui', 'E000418772');
    await page.click('#invia');
    await page.waitForFunction(() => document.querySelector('.conferma.visibile') !== null);
    deve(inviate.length === 1, 'non e\' partita nessuna candidatura');
    deve(inviate[0].rui_stato === 'E', 'la sezione scelta non arriva al server: ' + inviate[0].rui_stato);
    deve(inviate[0].rui === 'E000418772', 'il numero RUI non arriva: ' + inviate[0].rui);
    deve(inviate[0].provincia === 'TP', 'la provincia non si e\' compilata dal comune: ' + inviate[0].provincia);
    await context.close();
    return 'sezione, numero e provincia arrivano al server';
  });

  /* ── 3. la regola, per il prossimo campo ────────────────────────────────── */

  await prova('nessun altro comando del modulo e\' fuori dalla portata di un clic', async () => {
    /* La regola generale: una casella o un radio che il CSS nasconde deve
       stare dentro un <label>, o averne uno che lo punta. Cosi' il difetto non
       si ripete al prossimo campo che qualcuno aggiunge. */
    const { context, page } = await apri(browser);
    const orfani = await page.evaluate(() => {
      const fuori = [];
      document.querySelectorAll('input[type="radio"],input[type="checkbox"]').forEach(i => {
        const suo = i.closest('label') ||
                    (i.id && document.querySelector('label[for="' + CSS.escape(i.id) + '"]'));
        if (!suo) { fuori.push(i.id || i.name || '(senza nome)'); return; }
        /* E dev'essere grande abbastanza da prenderci sopra: la
           raccomandazione WCAG 2.5.8 sta a 24px, il minimo per un dito. */
        const r = suo.getBoundingClientRect();
        if (r.width < 24 || r.height < 24) fuori.push((i.id || i.name) + ' (' + Math.round(r.width) + '×' + Math.round(r.height) + ')');
      });
      return fuori;
    });
    deve(orfani.length === 0, 'non si riescono a spuntare col dito: ' + orfani.join(', '));
    await context.close();
    return 'ogni casella ha la sua etichetta cliccabile';
  });

  await prova('cio\' che e\' «hidden» sparisce davvero', async () => {
    /* `[hidden]` lo rende il foglio del browser, con una regola che qualunque
       classe scavalca: `.riga{display:flex}` bastava a tenere a video il campo
       del numero RUI. E' un difetto che torna al primo `display:` aggiunto a
       una classe, quindi si controlla su tutta la pagina, non solo li'. */
    const { context, page } = await apri(browser);
    const visibili = await page.evaluate(() =>
      [...document.querySelectorAll('[hidden]')]
        .filter(el => getComputedStyle(el).display !== 'none')
        .map(el => el.id || el.className || el.tagName));
    deve(visibili.length === 0, 'sono a video pur essendo nascosti: ' + visibili.join(', '));
    await context.close();
    return 'l\'attributo hidden regge su tutta la pagina';
  });

  await prova('nessun errore JavaScript in tutto il modulo', async () => {
    const { context, page, errori } = await apri(browser);
    await compila(page);
    await page.click('#rui-e + span');
    await page.fill('#rui', 'E000418772');
    await page.click('#apri-informativa');
    await page.click('#chiudi-informativa');
    await page.click('#invia');
    await page.waitForFunction(() => document.querySelector('.conferma.visibile') !== null);
    deve(errori.length === 0, errori.slice(0, 3).join(' | '));
    await context.close();
  });

  await browser.close();
};

avvio().then(() => {
  let ok = 0;
  for (const [passata, nome, msg] of esiti) {
    if (passata) { ok++; console.log('  ✅ ' + nome + (msg ? '  — ' + msg : '')); }
    else console.log('  ❌ ' + nome + '  — ' + msg);
  }
  console.log('\n' + (ok === esiti.length ? '🟢' : '🔴') + ' Modulo di candidatura: ' + ok + '/' + esiti.length + ' prove superate');
  process.exit(ok === esiti.length ? 0 : 1);
}).catch((e) => { console.error('Collaudo interrotto:', e); process.exit(1); });
