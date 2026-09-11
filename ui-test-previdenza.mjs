// ─────────────────────────────────────────────────────────────────────────────
// COLLAUDO DELLA PREVIDENZA IN DUE MINUTI — con un browser vero
//
// Il motore ha le sue 48 prove e sa fare i conti. Questa suite prova l'altra
// metà: che quei conti arrivino sullo schermo e sul foglio senza perdersi per
// strada, e che le tre cose che NON sono facoltative ci siano davvero.
//
//   · LA MARCATURA DELLO SCENARIO PRUDENZIALE. Spuntato «non lo so», tutto il
//     risultato è peggiorativo per costruzione: se la schermata non lo dice,
//     mostra un numero falso con l'aria di una stima.
//   · IL BLOCCO SUL RISCATTO SU TUTTE E DUE LE COLONNE. È l'obiezione numero
//     uno: se non è lì, il cliente ci pensa lo stesso — a casa, senza risposta.
//   · IL DISCLAIMER SUL FOGLIO. Senza, una proiezione diventa una promessa.
//
// Nessuna prova sulla forma del codice vedrebbe queste cose: la marcatura può
// essere calcolata giusta dal motore e non stampata, la tabella può esistere e
// perdere una colonna, il foglio può uscire senza l'avvertenza. Serve la
// pagina vera, con i clic veri.
//
//   node static-server.js &          # serve il repo sulla 8077
//   node ui-test-previdenza.mjs      # richiede: npm i --no-save playwright
//
// Se sulla macchina c'è già un Chromium (per esempio quello di sistema, o uno
// scaricato da una versione diversa di Playwright), lo si indica con
// CHROMIUM=/percorso/al/chrome invece di riscaricarlo.
//
// Ogni uscita verso la rete che non sia il server locale viene tappata: la
// pagina non deve chiamare la produzione per essere collaudata.
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright';
import { BASE, nuovaPagina } from './ui-collaudo.mjs';

const PAGINA = BASE + '/index.html';

const esiti = [];
async function prova(nome, fn) {
  try { const m = await fn(); esiti.push([true, nome, m || '']); }
  catch (e) { esiti.push([false, nome, (e && e.message) || String(e)]); }
}
function deve(c, msg) { if (!c) throw new Error(msg); }

/* Apre l'app col banco di prova condiviso — login simulato, Supabase e API
   finti, niente che esca verso la produzione — e va dritta alla schermata
   della previdenza. `errori` raccoglie gli errori JavaScript: una schermata
   che si disegna a metà per un'eccezione non è una schermata che funziona. */
async function apri(browser, larghezza = 1280) {
  const { context, page, errori } = await nuovaPagina(browser, {
    sessione: true, url: PAGINA, viewport: { width: larghezza, height: 1000 },
  });
  await page.waitForSelector('#main-screen', { state: 'visible' });
  await page.evaluate(() => window.apriPrevidenzaFlash());
  await page.waitForSelector('#page-prevflash', { state: 'visible' });
  return { context, page, errori };
}

/* Compila i quattro campi e preme Calcola. `inizio` a null spunta «non lo so». */
async function compila(page, d) {
  await page.fill('#pvf-eta', String(d.eta));
  await page.selectOption('#pvf-lavoro', d.lavoro);
  await page.fill('#pvf-reddito', String(d.reddito));
  await page.fill('#pvf-versamento', String(d.versamento));
  if (d.inizio === null) await page.check('#pvf-inizio-nosa');
  else if (d.inizio !== undefined) await page.fill('#pvf-inizio', String(d.inizio));
  await page.click('#page-prevflash button:has-text("Calcola")');
  await page.waitForSelector('#pvf-esito .pvf-card');
}

const DIPENDENTE = { eta: 38, lavoro: 'dipendente', reddito: 1800, versamento: 50, inizio: 24 };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });

/* ── 1. la schermata esiste, e ha quattro campi ─────────────────────────── */

await prova('la schermata si apre con i quattro campi, e nient\'altro da compilare', async () => {
  const { context, page, errori } = await apri(browser);
  const visibile = await page.isVisible('#page-prevflash');
  deve(visibile, 'la pagina della previdenza flash non si vede');
  for (const id of ['#pvf-eta', '#pvf-lavoro', '#pvf-reddito', '#pvf-versamento', '#pvf-inizio']) {
    deve(await page.isVisible(id), 'manca il campo ' + id);
  }
  /* Cinque caselle in tutto: i quattro campi più l'età di inizio lavoro. Se un
     giorno ne compare un sesto, questo non è più il flusso a quattro campi. */
  const quanti = await page.$$eval('#page-prevflash .pvf-card',
    (schede) => schede[0].querySelectorAll('.aw-field').length);
  deve(quanti === 5, 'i campi da compilare sono ' + quanti + ', non cinque');
  deve(!errori.length, 'errori in pagina: ' + errori.join(' | '));
  await context.close();
  return quanti + ' campi, nessun errore';
});

await prova('senza i dati non calcola, e dice quali mancano tutti insieme', async () => {
  const { context, page } = await apri(browser);
  await page.click('#page-prevflash button:has-text("Calcola")');
  await page.waitForSelector('#pvf-esito .pv-avviso');
  const t = await page.textContent('#pvf-esito');
  deve(/età/i.test(t) && /tipo di lavoro/i.test(t) && /reddito/i.test(t),
    'non elenca tutti i dati mancanti in una volta: ' + t.slice(0, 200));
  await context.close();
  return 'tre mancanze, un avviso solo';
});

/* ── 2. il risultato ────────────────────────────────────────────────────── */

await prova('il risultato mostra tasso di sostituzione, rendita e divario', async () => {
  const { context, page, errori } = await apri(browser);
  await compila(page, DIPENDENTE);
  const t = await page.textContent('#pvf-esito');
  deve(/tasso di sostituzione/i.test(t), 'manca il tasso di sostituzione');
  deve(/Pensione pubblica stimata/i.test(t), 'manca la pensione pubblica');
  deve(/Rendita del fondo/i.test(t), 'manca la rendita del fondo');
  deve(await page.isVisible('#pvf-esito .pvf-gap'), 'il divario non ha un riquadro suo');
  const gap = await page.textContent('#pvf-esito .pvf-gap .n');
  deve(/€/.test(gap) && /\d/.test(gap), 'il divario non è un importo: ' + gap);
  deve(!errori.length, 'errori in pagina: ' + errori.join(' | '));
  await context.close();
  return 'divario ' + gap.trim();
});

await prova('le proposte sono almeno tre, e una azzera il divario', async () => {
  const { context, page } = await apri(browser);
  await compila(page, { ...DIPENDENTE, versamento: 0 });
  const n = await page.$$eval('#pvf-esito .pvf-p', (e) => e.length);
  deve(n >= 3, 'le proposte sono ' + n + ', meno di tre');
  const azzera = await page.$$eval('#pvf-esito .pvf-p.azzera', (e) => e.length);
  deve(azzera >= 1, 'nessuna proposta dichiara di azzerare il divario');
  await context.close();
  return n + ' proposte';
});

await prova('e premendone una il conto si rifà con quell\'importo', async () => {
  /* È la mossa che si fa davanti al cliente — «e se mettessi cento?» — e deve
     costare un dito, non un ritorno su nel modulo. */
  const { context, page, errori } = await apri(browser);
  await compila(page, { ...DIPENDENTE, versamento: 20 });
  const primo = await page.textContent('#pvf-esito .pvf-gap .n');
  await page.click('#pvf-esito .pvf-p:nth-of-type(3)');
  await page.waitForTimeout(150);
  const versamento = await page.inputValue('#pvf-versamento');
  deve(Number(versamento) > 20, 'il versamento non è cambiato: ' + versamento);
  const dopo = await page.textContent('#pvf-esito .pvf-gap .n');
  deve(dopo !== primo, 'il divario non si è mosso: il conto non è stato rifatto');
  deve(!errori.length, 'errori in pagina: ' + errori.join(' | '));
  await context.close();
  return 'da 20 a ' + versamento + ' €, divario ' + primo.trim() + ' → ' + dopo.trim();
});

await prova('il risparmio fiscale è a schermo, col suo tetto scritto per intero', async () => {
  const { context, page } = await apri(browser);
  await compila(page, DIPENDENTE);
  const t = await page.textContent('#pvf-esito');
  deve(/[Rr]isparmio fiscale/.test(t), 'manca il risparmio fiscale');
  deve(/5\.164,57/.test(t), 'il tetto di deducibilità non è scritto a schermo');
  deve(/252\/2005/.test(t), 'il tetto non è riferito alla norma');
  await context.close();
  return 'tetto 5.164,57 €/anno in chiaro';
});

/* ── 3. lo scenario prudenziale ─────────────────────────────────────────── */

await prova('spuntato «non lo so», il risultato si dichiara prudenziale', async () => {
  /* Un numero peggiorativo per costruzione, presentato come stima, è un numero
     falso: la marcatura non è un dettaglio di cortesia. */
  const { context, page } = await apri(browser);
  await compila(page, { ...DIPENDENTE, inizio: null });
  const t = await page.textContent('#pvf-esito');
  deve(/[Ss]tima prudenziale/.test(t), 'il risultato non si dichiara prudenziale');
  deve(/inizio tardivo/i.test(t), 'non dice che assume un inizio tardivo');
  /* E la casella spegne il campo: le due risposte non possono convivere. */
  deve(await page.isDisabled('#pvf-inizio'), 'il campo dell\'età resta attivo accanto al «non lo so»');
  await context.close();
  return 'marcata in cima, campo spento';
});

await prova('e con l\'età di inizio lavoro NON si dichiara prudenziale', async () => {
  /* Una schermata che si dichiara prudenziale sempre non dichiara più niente. */
  const { context, page } = await apri(browser);
  await compila(page, DIPENDENTE);
  const t = await page.textContent('#pvf-esito');
  deve(!/[Ss]tima prudenziale/.test(t), 'si dichiara prudenziale anche con il dato completo');
  await context.close();
  return 'nessuna marcatura di troppo';
});

await prova('un\'età di inizio successiva a quella di oggi si tratta come sconosciuta, e si dice', async () => {
  const { context, page } = await apri(browser);
  await compila(page, { ...DIPENDENTE, eta: 30, inizio: 45 });
  const t = await page.textContent('#pvf-esito');
  deve(/[Ss]tima prudenziale/.test(t), 'un dato incoerente passa per buono');
  deve(/successiva/i.test(t), 'non spiega perché il dato è stato scartato');
  await context.close();
  return 'scartata, e col motivo';
});

/* ── 4. il confronto TFR e l'obiezione numero uno ───────────────────────── */

await prova('al dipendente si mostra il confronto TFR, su due colonne', async () => {
  const { context, page } = await apri(browser);
  await compila(page, DIPENDENTE);
  deve(await page.isVisible('#pvf-esito .pvf-tfr'), 'manca la tabella del confronto TFR');
  const intestazioni = await page.$$eval('#pvf-esito .pvf-tfr th', (e) => e.map((x) => x.textContent.trim()));
  deve(/azienda/i.test(intestazioni.join(' ')) && /fondo/i.test(intestazioni.join(' ')),
    'le due colonne non ci sono: ' + intestazioni.join(' | '));
  const t = await page.textContent('#pvf-esito .pvf-tfr');
  for (const voce of ['Tassazione', 'Rivalutazione', 'datore', 'Anticipazioni']) {
    deve(t.indexOf(voce) >= 0, 'manca la voce «' + voce + '» dal confronto');
  }
  await context.close();
  return 'quattro voci, due colonne';
});

await prova('e il blocco sul riscatto sta su TUTTE E DUE le colonne', async () => {
  /* È l'obiezione numero uno. Su una colonna sola sembra una caratteristica
     del fondo, invece è la domanda che il cliente si fa su entrambe. */
  const { context, page } = await apri(browser);
  await compila(page, DIPENDENTE);
  const riga = await page.$$eval('#pvf-esito .pvf-tfr tr', (righe) => {
    const r = righe.find((x) => /riprendere i miei soldi/i.test(x.textContent));
    return r ? [...r.querySelectorAll('td')].map((td) => td.textContent.trim()) : null;
  });
  deve(riga, 'la riga «quando posso riprendere i miei soldi» non c\'è');
  deve(riga.length === 3, 'la riga non ha le due colonne: ' + riga.length + ' celle');
  deve(riga[1].length > 30, 'la colonna «in azienda» del riscatto è vuota');
  deve(/50%/.test(riga[2]) && /12 mesi/.test(riga[2]) && /48 mesi/.test(riga[2]),
    'la colonna del fondo non riporta i termini del D.Lgs. 252/2005: ' + riga[2].slice(0, 120));
  await context.close();
  return 'su entrambe, coi termini di legge';
});

await prova('il confronto non diventa una raccomandazione', async () => {
  const { context, page } = await apri(browser);
  await compila(page, DIPENDENTE);
  const t = await page.textContent('#pvf-esito');
  deve(/non è una raccomandazione/i.test(t), 'il confronto non dichiara di non essere una raccomandazione');
  deve(/da confermare con HDI/i.test(t), 'i tempi di liquidazione non risultano da confermare con HDI');
  await context.close();
  return 'pro e contro, non un consiglio';
});

await prova('all\'autonomo niente tabella TFR, ma il blocco sul riscatto resta', async () => {
  const { context, page } = await apri(browser);
  await compila(page, { ...DIPENDENTE, lavoro: 'autonomo' });
  deve(!(await page.isVisible('#pvf-esito .pvf-tfr')), 'all\'autonomo si mostra il confronto TFR');
  const t = await page.textContent('#pvf-esito');
  deve(/riprendere i miei soldi/i.test(t), 'all\'autonomo sparisce anche l\'obiezione numero uno');
  deve(/48 mesi/.test(t), 'mancano i termini del riscatto');
  await context.close();
  return 'niente TFR, riscatto sì';
});

await prova('la frase sulla proposta a schermo è quella del motore, non una sua copia', async () => {
  /* A schermo e sul foglio lo stesso versamento deve chiamarsi allo stesso
     modo: il cliente li guarda tutti e due, spesso nello stesso minuto. */
  const { context, page } = await apri(browser);
  await compila(page, { ...DIPENDENTE, versamento: 0 });
  const confronto = await page.evaluate(() =>
    PVF.esito.proposte.filter((p) => p.versamentoMensile > 0).map((p) => ({
      motore: PrevidenzaFlash.frasePer(p),
      schermo: [...document.querySelectorAll('#pvf-esito .pvf-p')]
        .filter((b) => b.textContent.indexOf('€ ' + p.versamentoMensile) === 0)
        .map((b) => b.textContent).join(''),
    })));
  deve(confronto.length >= 3, 'non ci sono abbastanza proposte da confrontare');
  for (const c of confronto) {
    deve(c.schermo.indexOf(c.motore) >= 0,
      'a schermo la proposta non dice «' + c.motore + '»: ' + c.schermo.slice(0, 90));
  }
  await context.close();
  return confronto.map((c) => c.motore).join(' · ');
});

/* ── 5. il foglio ───────────────────────────────────────────────────────── */

await prova('il foglio si apre, col disclaimer e la marcatura prudenziale', async () => {
  const { context, page, errori } = await apri(browser);
  await compila(page, { ...DIPENDENTE, inizio: null });
  await page.fill('#pvf-cli', 'Mario Rossi');
  await page.fill('#pvf-cons', 'Francesco Oddo');
  const [foglio] = await Promise.all([
    context.waitForEvent('page'),
    page.click('#pvf-esito button:has-text("Stampa il foglio")'),
  ]);
  await foglio.waitForLoadState('domcontentloaded');
  const t = await foglio.textContent('body');
  deve(/scopo illustrativo/i.test(t), 'il foglio esce senza disclaimer');
  deve(/non è una promessa di rendimento/i.test(t), 'manca «non è una promessa di rendimento»');
  deve(/[Ss]tima prudenziale/.test(t), 'lo scenario peggiorativo non è marcato sul foglio');
  deve(/riprendere i miei soldi/i.test(t), 'il blocco sul riscatto non è sul foglio');
  deve(/Mario Rossi/.test(t) && /Francesco Oddo/.test(t), 'il foglio non porta cliente e consulente');
  deve(!errori.length, 'errori in pagina: ' + errori.join(' | '));
  await context.close();
  return 'disclaimer, marcatura e riscatto sul foglio';
});

await prova('senza il consulente che firma, il foglio non esce', async () => {
  /* Meglio nessun documento che un documento non firmato: fra un anno quel
     foglio torna indietro e deve dire da chi viene. */
  const { context, page } = await apri(browser);
  await compila(page, DIPENDENTE);
  await page.fill('#pvf-cons', '');
  await page.click('#pvf-esito button:has-text("Stampa il foglio")');
  await page.waitForTimeout(300);
  const avvisi = await page.evaluate(() => (window.__COLLAUDO.alerts || []).join(' | '));
  deve(/consulente/i.test(avvisi), 'il foglio esce senza firma (avvisi: «' + avvisi + '»)');
  await context.close();
  return 'bloccato, e col motivo';
});

/* ── 6. l'aggancio all'anagrafica ───────────────────────────────────────── */

await prova('dalla scheda cliente il calcolo arriva già compilato', async () => {
  const { context, page, errori } = await apri(browser);
  await page.evaluate(() => {
    ANAG_CACHE = [{ id: 'c1', tipo: 'fisica', nominativo: 'Mario Rossi',
      data_nascita: '1988-03-10', professione: 'Impiegato', cellulare: '333 1234567' }];
    pensioneDaCliente('c1');
  });
  await page.waitForSelector('#pvf-dacliente .pv-ok');
  const eta = await page.inputValue('#pvf-eta');
  const lavoro = await page.inputValue('#pvf-lavoro');
  deve(Number(eta) >= 37 && Number(eta) <= 39, 'l\'età non arriva dalla data di nascita: ' + eta);
  deve(lavoro === 'dipendente', '«Impiegato» non diventa dipendente: ' + lavoro);
  const t = await page.textContent('#pvf-dacliente');
  deve(/Mario Rossi/.test(t), 'non dice di chi è il calcolo');
  deve(/reddito netto/i.test(t) && /inizio lavoro/i.test(t), 'non dice cosa resta da chiedere');
  /* E il nome del cliente arriva fino al foglio, senza riscriverlo. */
  await compila(page, { ...DIPENDENTE, eta: Number(eta), inizio: 24 });
  deve((await page.inputValue('#pvf-cli')) === 'Mario Rossi', 'il nome del cliente non arriva al foglio');
  deve(!errori.length, 'errori in pagina: ' + errori.join(' | '));
  await context.close();
  return 'età e lavoro ripresi, resta il reddito';
});

await prova('e quando la professione non si capisce, il tipo di lavoro NON viene indovinato', async () => {
  /* Fra dipendente e autonomo ballano venti punti di pensione: un tipo di
     lavoro sbagliato non dà errore, dà una pensione credibile e sbagliata. */
  const { context, page } = await apri(browser);
  await page.evaluate(() => {
    ANAG_CACHE = [{ id: 'c2', tipo: 'fisica', nominativo: 'Anna Bianchi',
      data_nascita: '1980-07-01', professione: 'Collaboratrice' }];
    pensioneDaCliente('c2');
  });
  await page.waitForSelector('#pvf-dacliente');
  deve((await page.inputValue('#pvf-lavoro')) === '', 'il tipo di lavoro è stato scelto lo stesso');
  const t = await page.textContent('#pvf-dacliente');
  deve(/va scelto a mano/i.test(t), 'non chiede di scegliere il tipo di lavoro');
  await context.close();
  return 'tendina vuota, e il perché scritto';
});

await prova('e a una società il pulsante non si offre nemmeno', async () => {
  /* Il fondo pensione è di una persona: una partita IVA non ha un\'età. */
  const { context, page } = await apri(browser);
  const soloPersone = await page.evaluate(() => {
    const f = String(window.apriAnagrafica);
    const riga = f.split('\n').find((r) => r.indexOf('pensioneDaCliente') >= 0) || '';
    return /!isG/.test(riga);
  });
  deve(soloPersone, 'il pulsante «Calcola pensione» compare anche sulle anagrafiche giuridiche');
  await context.close();
  return 'solo persone fisiche';
});

/* ── 7. il telefono ─────────────────────────────────────────────────────── */

await prova('su uno schermo stretto la pagina non scorre in orizzontale', async () => {
  /* Il modulo si usa in piedi davanti a un cliente, e spesso dal telefono.
     La tabella a tre colonne può scorrere — dentro il suo riquadro — ma la
     pagina no. */
  const { context, page } = await apri(browser, 390);
  await compila(page, DIPENDENTE);
  const largo = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  deve(!largo, 'la pagina scorre in orizzontale su 390 px');
  deve(await page.isVisible('#pvf-esito .pvf-gap'), 'il divario non si vede sul telefono');
  await context.close();
  return '390 px, nessuno scorrimento laterale';
});

await browser.close();

/* ── esecuzione ─────────────────────────────────────────────────────────── */
let ok = 0;
for (const [passata, nome, msg] of esiti) {
  if (passata) { ok++; console.log('  ✅ ' + nome + (msg ? '  — ' + msg : '')); }
  else console.log('  ❌ ' + nome + '  — ' + msg);
}
console.log('\n' + (ok === esiti.length ? '🟢' : '🔴') + ' Previdenza in due minuti: ' + ok + '/' + esiti.length);
process.exit(ok === esiti.length ? 0 : 1);
