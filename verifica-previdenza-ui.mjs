/* Collaudo dell'interfaccia Previdenza in un browser vero.

     node static-server.js &
     node verifica-previdenza-ui.mjs

   Serve playwright: o installato nel progetto (npm i --no-save playwright,
   come per ui-test.mjs), oppure già presente nel sistema — in quel caso si
   indica dove sta con PLAYWRIGHT_PATH. */

const chromium = await (async () => {
  const percorsi = ['playwright', process.env.PLAYWRIGHT_PATH, '/opt/node22/lib/node_modules/playwright/index.js'].filter(Boolean);
  for (const p of percorsi) {
    try {
      const m = await import(p);
      // Caricato come CJS l'oggetto finisce sotto .default.
      const c = m.chromium || (m.default && m.default.chromium);
      if (c) return c;
    } catch { /* si prova il percorso successivo */ }
  }
  console.error('playwright non trovato. Installalo con "npm i --no-save playwright"\n' +
                'oppure indica il percorso con PLAYWRIGHT_PATH.');
  process.exit(2);
})();

const URL_APP = process.env.URL_APP || 'http://127.0.0.1:8077/index.html';
const CARTELLA = process.env.CARTELLA_SCATTI || '/tmp';

let ok = 0, ko = 0;
const prova = (nome, cond, extra) => {
  if (cond) { ok++; console.log(`  PASS  ${nome}${extra ? '  → ' + extra : ''}`); }
  else { ko++; console.log(`  FAIL  ${nome}${extra ? '  → ' + extra : ''}`); }
};
const titolo = t => { console.log('\n' + t); console.log('─'.repeat(t.length)); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

const erroriConsole = [];
page.on('console', m => { if (m.type() === 'error') erroriConsole.push(m.text()); });
page.on('pageerror', e => erroriConsole.push('pageerror: ' + e.message));

await page.goto(URL_APP, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

/* Senza sessione Supabase l'app resta sulla schermata di accesso e la scocca
   è nascosta. Il modulo Previdenza non dipende dal login (calcola in locale),
   quindi per collaudarlo si scopre la scocca a mano. Serve anche perché
   ApexCharts non disegna dentro un contenitore con display:none. */
await page.evaluate(() => {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-screen').style.display = 'flex';
});
await page.waitForTimeout(300);

/* In questo ambiente la CDN non è raggiungibile, quindi ApexCharts non arriva
   e i grafici resterebbero vuoti senza che ci sia un difetto. Se ne esiste una
   copia locale (npm i --no-save apexcharts) la si inietta, così i grafici
   vengono collaudati davvero. */
let grafici_collaudabili = true;
if (!(await page.evaluate(() => typeof ApexCharts !== 'undefined'))) {
  try {
    await page.addScriptTag({ path: 'node_modules/apexcharts/dist/apexcharts.min.js' });
    await page.waitForTimeout(400);
  } catch { /* nessuna copia locale */ }
  grafici_collaudabili = await page.evaluate(() => typeof ApexCharts !== 'undefined');
  if (!grafici_collaudabili) console.log('\n  (ApexCharts non disponibile: le prove sui grafici sono saltate)');
}

/* ── Caricamento ─────────────────────────────────────────────────────── */
titolo('Caricamento del modulo');
{
  const stato = await page.evaluate(() => ({
    motore: typeof window.PREV === 'object' && typeof window.PREV.confrontoTfr === 'function',
    ui: typeof window.PRVUI === 'object',
    apri: typeof window.openPrevidenza === 'function',
    // MODULES è un const di script: non finisce su window, si legge come identificatore.
    modulo: typeof MODULES !== 'undefined' && !!MODULES.find(m => m.key === 'previdenza'),
    pagine: ['page-previdenza', 'page-prv-privato', 'page-prv-azienda'].every(id => !!document.getElementById(id)),
    css: !!Array.from(document.styleSheets).find(s => (s.href || '').includes('previdenza.css'))
  }));
  prova('Il motore di calcolo è caricato', stato.motore);
  prova('L\'interfaccia è caricata (PRVUI)', stato.ui);
  prova('openPrevidenza è raggiungibile da openModule', stato.apri);
  prova('Il modulo è nell\'elenco MODULES', stato.modulo);
  prova('I tre contenitori di pagina esistono', stato.pagine);
  prova('Il foglio di stile è collegato', stato.css);
}

/* ── Home del modulo ─────────────────────────────────────────────────── */
titolo('Home del modulo');
{
  await page.evaluate(() => window.openPrevidenza());
  await page.waitForTimeout(700);
  const r = await page.evaluate(() => ({
    attiva: document.getElementById('page-previdenza').classList.contains('active'),
    card: document.querySelectorAll('#previdenza-grid .mod-card').length,
    testi: Array.from(document.querySelectorAll('#previdenza-grid .mod-name')).map(n => n.textContent.trim())
  }));
  prova('La pagina Previdenza si apre', r.attiva);
  prova('Ci sono le due strade, Privato e Azienda', r.card === 2, r.testi.join(' / '));
}

/* ── Privato ─────────────────────────────────────────────────────────── */
titolo('Lato privato');
{
  await page.evaluate(() => window.PRVUI.apriPrivato());
  await page.waitForTimeout(1200);

  const r = await page.evaluate(() => {
    const val = id => { const e = document.getElementById(id); return e ? e.textContent.trim() : null; };
    return {
      attiva: document.getElementById('page-prv-privato').classList.contains('active'),
      campi: document.querySelectorAll('#prv-privato-body .prv-form input, #prv-privato-body .prv-form select').length,
      stat: Array.from(document.querySelectorAll('#prv-out-privato .prv-stats .stat-value')).map(n => n.textContent.trim()),
      etichette: Array.from(document.querySelectorAll('#prv-out-privato .prv-stats .stat-label')).map(n => n.textContent.trim()),
      grafici: ['prv-ch-gap', 'prv-ch-tfr', 'prv-ch-conf'].map(id => {
        const e = document.getElementById(id);
        return e ? e.querySelectorAll('svg').length > 0 : false;
      }),
      righeTabella: document.querySelectorAll('#prv-out-privato .prv-tabella tbody tr').length,
      disclaimer: !!document.querySelector('#prv-out-privato .prv-disclaimer'),
      ipotesi: document.querySelectorAll('#prv-out-privato details.prv-ipotesi').length
    };
  });

  prova('La pagina Privato si apre', r.attiva);
  prova('Il pannello dei comandi ha i suoi campi', r.campi >= 12, r.campi + ' campi');
  prova('I riquadri numerici sono valorizzati', r.stat.length >= 4 && r.stat.every(v => v && v !== '—'), r.stat.slice(0, 4).join(' | '));
  prova('Il grafico del gap è disegnato', r.grafici[0]);
  prova('Il grafico del TFR è disegnato', r.grafici[1]);
  prova('Il grafico del confronto è disegnato', r.grafici[2]);
  prova('La tabella di confronto ha righe', r.righeTabella >= 4, r.righeTabella + ' righe');
  prova('Il disclaimer è presente', r.disclaimer);
  prova('Le ipotesi sono esposte', r.ipotesi >= 2, r.ipotesi + ' blocchi');

  await page.screenshot({ path: CARTELLA + '/previdenza-privato.png', fullPage: true });
}

/* ── Interattività: il ricalcolo dal vivo ────────────────────────────── */
titolo('Interattività — i numeri devono cambiare mentre si muovono i comandi');
{
  const primaGap = await page.evaluate(() =>
    document.querySelectorAll('#prv-out-privato .prv-stats .stat-value')[2].textContent.trim());

  // Raddoppio la RAL: tutto deve cambiare.
  await page.fill('#prv-ral', '60000');
  await page.waitForTimeout(600);
  const dopoRal = await page.evaluate(() =>
    document.querySelectorAll('#prv-out-privato .prv-stats .stat-value')[2].textContent.trim());
  prova('Cambiando la RAL il gap si ricalcola', primaGap !== dopoRal, `${primaGap} → ${dopoRal}`);

  // Cambio scenario: il TFR nel fondo deve muoversi.
  const primaTfr = await page.evaluate(() => {
    const s = document.querySelectorAll('#prv-out-privato .prv-stats-2 .stat-value');
    return s.length > 1 ? s[1].textContent.trim() : null;
  });
  await page.click('.prv-scen[data-k="ottimistico"]');
  await page.waitForTimeout(700);
  const dopoScen = await page.evaluate(() => {
    const s = document.querySelectorAll('#prv-out-privato .prv-stats-2 .stat-value');
    return s.length > 1 ? s[1].textContent.trim() : null;
  });
  prova('Cambiando scenario il TFR nel fondo si ricalcola', primaTfr !== dopoScen, `${primaTfr} → ${dopoScen}`);
  prova('Lo scenario selezionato è evidenziato',
    await page.evaluate(() => document.querySelector('.prv-scen[data-k="ottimistico"]').classList.contains('on')));

  // Cursore della linea di investimento.
  await page.selectOption('#prv-profilo', 'azionaria');
  await page.waitForTimeout(700);
  const dopoLinea = await page.evaluate(() => {
    const s = document.querySelectorAll('#prv-out-privato .prv-stats-2 .stat-value');
    return s.length > 1 ? s[1].textContent.trim() : null;
  });
  prova('Cambiando linea di investimento il risultato si ricalcola', dopoScen !== dopoLinea, `${dopoScen} → ${dopoLinea}`);

  // Cursore: la crescita retributiva.
  await page.evaluate(() => {
    const el = document.getElementById('prv-crescitaRal');
    el.value = '4'; el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(600);
  prova('Il cursore aggiorna la propria etichetta',
    (await page.textContent('#prv-crescitaRal-val')).includes('4'),
    await page.textContent('#prv-crescitaRal-val'));
}

/* ── Validazione ─────────────────────────────────────────────────────── */
titolo('Validazione — i dati impossibili non devono produrre numeri');
{
  await page.fill('#prv-eta', '10');
  await page.waitForTimeout(600);
  const err = await page.evaluate(() => !!document.querySelector('#prv-out-privato .prv-errori'));
  prova('Un\'età impossibile fa comparire l\'avviso invece dei risultati', err);

  await page.fill('#prv-eta', '40');
  await page.waitForTimeout(600);
  const tornata = await page.evaluate(() => !!document.querySelector('#prv-out-privato .prv-stats'));
  prova('Correggendo il dato i risultati tornano', tornata);
}

/* ── Presidio sulle ipotesi disallineate ─────────────────────────────── */
titolo('Presidio — ipotesi disallineate devono essere segnalate');
{
  await page.evaluate(() => {
    const c = document.getElementById('prv-crescitaRal'); c.value = '0.5'; c.dispatchEvent(new Event('input', { bubbles: true }));
    const t = document.getElementById('prv-tassoCapitalizzazione'); t.value = '3'; t.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(700);
  const avvisi = await page.evaluate(() => document.querySelectorAll('#prv-out-privato .prv-avviso').length);
  prova('Compare l\'avvertenza sulle ipotesi disallineate', avvisi > 0, avvisi + ' avvisi');
}

/* ── Azienda ─────────────────────────────────────────────────────────── */
titolo('Lato azienda');
{
  await page.evaluate(() => window.PRVUI.apriAzienda());
  await page.waitForTimeout(1200);

  const r = await page.evaluate(() => ({
    attiva: document.getElementById('page-prv-azienda').classList.contains('active'),
    campi: document.querySelectorAll('#prv-azienda-body .prv-form input, #prv-azienda-body .prv-form select').length,
    stat: Array.from(document.querySelectorAll('#prv-out-azienda .prv-stats .stat-value')).map(n => n.textContent.trim()),
    grafici: ['prv-ch-az', 'prv-ch-erog'].map(id => {
      const e = document.getElementById(id); return e ? e.querySelectorAll('svg').length > 0 : false;
    }),
    tabelle: document.querySelectorAll('#prv-out-azienda .prv-tabella').length,
    righeErog: document.querySelectorAll('#prv-out-azienda .prv-tabella')[1]?.querySelectorAll('tbody tr').length || 0
  }));

  prova('La pagina Azienda si apre', r.attiva);
  prova('Il pannello dei comandi ha i suoi campi', r.campi >= 9, r.campi + ' campi');
  prova('I riquadri numerici sono valorizzati', r.stat.length >= 8, r.stat.length + ' riquadri');
  prova('Il grafico del fondo TFR è disegnato', r.grafici[0]);
  prova('Il grafico del costo di erogazione è disegnato', r.grafici[1]);
  prova('Ci sono entrambe le tabelle', r.tabelle >= 2, r.tabelle + ' tabelle');
  prova('Il confronto erogazione ha le quattro modalità', r.righeErog === 4, r.righeErog + ' righe');

  await page.screenshot({ path: CARTELLA + '/previdenza-azienda.png', fullPage: true });
}

/* ── Interattività azienda ───────────────────────────────────────────── */
titolo('Interattività lato azienda');
{
  const prima = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#prv-out-azienda .prv-stats .stat-value')).slice(0, 4).map(n => n.textContent.trim()).join(' | '));

  // Sopra la soglia dei 50 dipendenti il discorso cambia: il TFR va al Fondo Tesoreria.
  await page.fill('#prva-dipendenti', '80');
  await page.waitForTimeout(700);
  const r = await page.evaluate(() => ({
    stat: Array.from(document.querySelectorAll('#prv-out-azienda .prv-stats .stat-value')).slice(0, 4).map(n => n.textContent.trim()).join(' | '),
    testo: document.querySelector('#prv-out-azienda .prv-head-s').textContent
  }));
  prova('Superata la soglia i numeri cambiano', prima !== r.stat, `[${prima}] → [${r.stat}]`);
  prova('Il testo spiega il passaggio al Fondo di Tesoreria', /Tesoreria/i.test(r.testo), r.testo.trim());

  // Il netto obiettivo pilota il confronto sulle forme di erogazione.
  await page.fill('#prva-nettoObiettivo', '2000');
  await page.waitForTimeout(700);
  const titoloErog = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#prv-out-azienda .prv-head-t')).pop().textContent);
  prova('Il titolo del confronto segue il netto impostato', /2\.000/.test(titoloErog), titoloErog.trim());
}

/* ── Adattamento a schermo stretto ───────────────────────────────────── */
titolo('Uso da telefono');
{
  await page.setViewportSize({ width: 390, height: 850 });
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => {
    const l = document.querySelector('.prv-layout');
    const body = document.body;
    return {
      unaColonna: getComputedStyle(l).gridTemplateColumns.split(' ').length === 1,
      niente_scroll_orizzontale: body.scrollWidth <= window.innerWidth + 2
    };
  });
  prova('Il pannello passa a una colonna sola', r.unaColonna);
  prova('La pagina non scorre in orizzontale', r.niente_scroll_orizzontale);
  await page.screenshot({ path: CARTELLA + '/previdenza-telefono.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
}

/* ── Console pulita ──────────────────────────────────────────────────── */
titolo('Console del browser');
{
  // Gli errori di rete verso Supabase sono attesi: qui non c'è sessione.
  const rilevanti = erroriConsole.filter(e =>
    !/supabase|Failed to load resource|401|403|net::ERR/i.test(e));
  prova('Nessun errore JavaScript nel modulo', rilevanti.length === 0,
    rilevanti.length ? rilevanti.slice(0, 3).join(' ; ') : 'console pulita');
}

await browser.close();
console.log('\n' + '═'.repeat(60));
console.log(`  ${ok} prove superate, ${ko} fallite`);
console.log(`  Schermate in ${CARTELLA}/previdenza-*.png`);
console.log('═'.repeat(60) + '\n');
process.exit(ko === 0 ? 0 : 1);
