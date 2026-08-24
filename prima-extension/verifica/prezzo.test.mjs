// ═══════════════════════════════════════════════════════════════════════════════
//  IL PREMIO DI PRIMA NON PUÒ ESSERE UNA RATA CHIAMATA «ANNUO»
//
//  La covers-api di Prima non restituisce «il premio»: restituisce un elenco di
//  OPZIONI DI PAGAMENTO (annuale, semestrale, mensile…), ognuna con le sue
//  garanzie e i suoi importi.
//
//  L'estensione prendeva `installments[0]` — la prima che capitava — e la
//  chiamava `premio_annuale`. Se la prima è la mensile, il numero mostrato al
//  cliente è UNA RATA spacciata per il premio dell'anno: 50 € invece di 600.
//  In un preventivo assicurativo un premio troppo basso è l'errore peggiore,
//  perché il cliente ci conta e la differenza salta fuori all'emissione.
//  E il frazionamento scelto dall'operatore in QUOTO veniva ignorato del tutto.
//
//  Queste prove girano senza portale: sono aritmetica su una risposta.
//  I dati hanno la forma vera della covers-api (installmentPrices →
//  installments → guarantees → priceBlocks → coveragePrice.legal), con importi
//  inventati.
// ═══════════════════════════════════════════════════════════════════════════════
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const QUI = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { leggiPremio, euro, quanteRate, rateChieste } = createRequire(import.meta.url)(path.join(QUI, 'prezzo.js'));

const esiti = [];
const prova = (nome, fn) => { try { fn(); esiti.push([true, nome, '']); } catch (e) { esiti.push([false, nome, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

/* Una garanzia come la manda Prima. */
const gar = (slug, prezzo, selected = true) => ({
  slug, label: slug, selected,
  priceBlocks: [{ coveragePrice: { legal: String(prezzo), presentation: String(prezzo), full: String(prezzo) } }],
});

/* Un'opzione di pagamento: `count` è il numero di rate. */
const opzione = (count, nome, garanzie) => ({
  installmentConfiguration: { count, slug: nome, labels: { name: nome } },
  guarantees: garanzie,
});

/* La risposta completa, con le opzioni nell'ordine in cui capita. */
const risposta = (...opzioni) => ({ installmentPrices: [{ installments: opzioni }] });

// ── 1. Il caso che ha fatto nascere il file ─────────────────────────────────
prova('con la mensile per prima, il premio annuo NON è la rata', () => {
  /* Prima restituisce le opzioni nell'ordine che vuole lei. Qui la mensile è
     la prima: il codice vecchio avrebbe detto «premio annuale: 50 €». */
  const q = risposta(
    opzione(12, 'Mensile', [gar('rca', 50)]),
    opzione(1, 'Annuale', [gar('rca', 600)]),
  );
  const r = leggiPremio(q, 'annuale');
  deve(r.ok, 'non ha letto il premio: ' + r.error);
  deve(r.premio_annuo === 600, 'premio annuo ' + r.premio_annuo + ' invece di 600: ha preso la prima opzione');
  deve(r.rate === 1, 'ha scelto un\'opzione da ' + r.rate + ' rate invece dell\'annuale');
});

prova('e se chiedo la mensile, mi dà la rata E il totale dell\'anno', () => {
  /* Con 12 rate da 50 € il cliente in un anno paga 600. Scrivere 50 nel campo
     «premio annuo» e' la bugia da cui nasce tutto. */
  const q = risposta(
    opzione(1, 'Annuale', [gar('rca', 600)]),
    opzione(12, 'Mensile', [gar('rca', 50)]),
  );
  const r = leggiPremio(q, 'mensile');
  deve(r.ok, 'non ha letto il premio: ' + r.error);
  deve(r.premio_rata === 50, 'la rata e\' ' + r.premio_rata + ' invece di 50');
  deve(r.premio_annuo === 600, 'il premio annuo e\' ' + r.premio_annuo + ' invece di 600');
  deve(r.rate === 12, 'rate ' + r.rate);
});

prova('il frazionamento chiesto viene davvero usato', () => {
  const q = risposta(
    opzione(1, 'Annuale', [gar('rca', 600)]),
    opzione(2, 'Semestrale', [gar('rca', 310)]),
  );
  deve(leggiPremio(q, 'annuale').premio_annuo === 600, 'annuale sbagliata');
  const s = leggiPremio(q, 'semestrale');
  deve(s.rate === 2 && s.premio_rata === 310 && s.premio_annuo === 620,
    'semestrale letta male: ' + JSON.stringify({ rate: s.rate, rata: s.premio_rata, annuo: s.premio_annuo }));
});

// ── 2. Quando non si sa, non si inventa ─────────────────────────────────────
prova('se il frazionamento chiesto non c\'è, lo dice invece di ripiegare', () => {
  /* Ripiegare in silenzio su «la prima disponibile» e' esattamente il difetto
     che questo file esiste per togliere. */
  const q = risposta(opzione(12, 'Mensile', [gar('rca', 50)]));
  const r = leggiPremio(q, 'annuale');
  deve(!r.ok, 'ha risposto ' + r.premio_annuo + ' per un frazionamento che Prima non offre');
  deve(/non offre il frazionamento/i.test(r.error), 'il messaggio non spiega: ' + r.error);
  deve(/12 rate/.test(r.error), 'non dice cosa c\'e\' invece: ' + r.error);
  deve(Array.isArray(r.disponibili) && r.disponibili.length === 1, 'non elenca le opzioni disponibili');
});

prova('nessuna garanzia selezionata vuol dire «niente premio», non zero', () => {
  /* Un preventivo da 0 € consegnato come valido e' peggio di un errore. */
  const q = risposta(opzione(1, 'Annuale', [gar('rca', 600, false)]));
  const r = leggiPremio(q, 'annuale');
  deve(!r.ok, 'ha consegnato un premio di ' + r.premio_annuo + ' senza garanzie selezionate');
  deve(/selezionate/i.test(r.error), 'il messaggio non dice perche\': ' + r.error);
});

prova('una risposta vuota non diventa un preventivo', () => {
  for (const q of [null, {}, { installmentPrices: [] }, { installmentPrices: [{ installments: [] }] }]) {
    const r = leggiPremio(q, 'annuale');
    deve(!r.ok, 'ha letto un premio da ' + JSON.stringify(q));
    deve(typeof r.error === 'string' && r.error.length > 10, 'errore poco chiaro: ' + r.error);
  }
});

// ── 3. La somma delle garanzie ──────────────────────────────────────────────
prova('somma solo le garanzie selezionate', () => {
  const q = risposta(opzione(1, 'Annuale', [
    gar('rca', 400), gar('furto', 150), gar('cristalli', 80, false),
  ]));
  const r = leggiPremio(q, 'annuale');
  deve(r.premio_annuo === 550, 'ha sommato ' + r.premio_annuo + ' invece di 550: ha contato anche le non selezionate');
  deve(r.garanzie.length === 2, 'elenca ' + r.garanzie.length + ' garanzie invece di 2');
});

prova('i centesimi non si perdono per strada', () => {
  const q = risposta(opzione(1, 'Annuale', [gar('rca', '140.33'), gar('furto', '70.00')]));
  const r = leggiPremio(q, 'annuale');
  deve(r.premio_annuo === 210.33, 'ha letto ' + r.premio_annuo + ' invece di 210.33');
});

prova('la virgola decimale all\'italiana si legge', () => {
  deve(euro('591,09') === 591.09, 'euro("591,09") = ' + euro('591,09'));
  deve(euro('591.09') === 591.09, 'euro("591.09") = ' + euro('591.09'));
  deve(euro('') === null && euro(null) === null, 'il vuoto deve valere «non lo so», non 0');
});

// ── 4. Riconoscere quante rate ha un'opzione ────────────────────────────────
prova('il numero di rate si legge anche quando Prima lo scrive a parole', () => {
  deve(quanteRate({ installmentConfiguration: { count: 4 } }) === 4, 'count non letto');
  deve(quanteRate({ installmentConfiguration: { labels: { name: 'Semestrale' } } }) === 2, 'semestrale non riconosciuta');
  deve(quanteRate({ installmentConfiguration: { slug: 'mensile' } }) === 12, 'mensile non riconosciuta');
  deve(quanteRate({ installmentConfiguration: { labels: { name: 'Soluzione unica' } } }) === 1, 'soluzione unica non riconosciuta');
  deve(quanteRate({ installmentConfiguration: { labels: { name: 'boh' } } }) === null, 'ha inventato un numero di rate');
});

prova('quello che chiede QUOTO si traduce in un numero di rate', () => {
  deve(rateChieste('Annuale') === 1 && rateChieste('annuale') === 1, 'annuale');
  deve(rateChieste('Semestrale') === 2, 'semestrale');
  deve(rateChieste('Mensile') === 12, 'mensile');
  deve(rateChieste('') === 1 && rateChieste(undefined) === 1, 'in mancanza d\'altro deve valere annuale');
});

// ── 5. Più piani di pagamento ───────────────────────────────────────────────
prova('cerca l\'opzione in tutti i piani, non solo nel primo', () => {
  /* Prima puo' restituire piu' `installmentPrices`. L'annuale potrebbe essere
     nel secondo: fermarsi al primo vorrebbe dire dire «non c'e'» a torto. */
  const q = {
    installmentPrices: [
      { installments: [opzione(12, 'Mensile', [gar('rca', 50)])] },
      { installments: [opzione(1, 'Annuale', [gar('rca', 600)])] },
    ],
  };
  const r = leggiPremio(q, 'annuale');
  deve(r.ok && r.premio_annuo === 600, 'non ha trovato l\'annuale nel secondo piano: ' + (r.error || r.premio_annuo));
});

prova('le altre opzioni restano a portata di mano', () => {
  const q = risposta(
    opzione(1, 'Annuale', [gar('rca', 600)]),
    opzione(12, 'Mensile', [gar('rca', 55)]),
  );
  const r = leggiPremio(q, 'annuale');
  deve(Array.isArray(r.alternative) && r.alternative.length === 1, 'non riporta le alternative');
  deve(r.alternative[0].annuo === 660, 'l\'annuo dell\'alternativa e\' ' + r.alternative[0].annuo + ' invece di 660');
});

let ko = 0;
console.log('\nPREMIO PRIMA — una rata non è un anno');
for (const [ok, n, m] of esiti) { console.log(ok ? '  ok  ' + n : '  X   ' + n + '\n      ' + m); if (!ok) ko++; }
console.log(`\nPREMIO PRIMA: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
