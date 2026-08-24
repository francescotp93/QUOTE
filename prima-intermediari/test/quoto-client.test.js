// Test sulle conversioni di unita' fra i due endpoint Prima.
// I valori sono quelli realmente osservati sul portale.
import assert from 'node:assert/strict';
import { euroFromString, euroFromCents, centsFromEuro, normalizeQuote } from '../src/prima-quoto-client.js';

let pass = 0, fail = 0;
const check = (n, fn) => { try { fn(); pass++; console.log(`  ok  ${n}`); }
  catch (e) { fail++; console.log(`  FAIL ${n}\n       ${e.message}`); } };

console.log('\n--- Unita di misura (il bug economico piu probabile) ---');
check('covers-api: "591.09" -> 591.09 EUR', () => assert.equal(euroFromString('591.09'), 591.09));
check('covers-api: "68" -> 68 EUR',        () => assert.equal(euroFromString('68'), 68));
check('covers-api: "11.8" -> 11.8 EUR',    () => assert.equal(euroFromString('11.8'), 11.8));
check('flexibility: 41720 centesimi -> 417.20 EUR', () => assert.equal(euroFromCents(41720), 417.20));
check('flexibility: 861 centesimi -> 8.61 EUR',     () => assert.equal(euroFromCents(861), 8.61));
check('ritorno: 417.20 EUR -> 41720 centesimi',     () => assert.equal(centsFromEuro(417.20), 41720));
check('round-trip euro->cents->euro senza deriva',  () => assert.equal(euroFromCents(centsFromEuro(527.76)), 527.76));
check('null/vuoto non diventano 0 (0 sarebbe un premio finto)', () => {
  assert.equal(euroFromString(null), null);
  assert.equal(euroFromString(''), null);
  assert.equal(euroFromCents(undefined), null);
});
check('virgola decimale italiana gestita', () => assert.equal(euroFromString('591,09'), 591.09));

console.log('\n--- normalizeQuote su struttura reale ---');
const raw = {
  __typename: 'Quote', id: 'q-1', tariff: 'BLACK',
  issuingCompany: { slug: 'prima' }, guideType: 'EXPERT',
  effectiveDate: '2026-09-04T23:59:00+00:00', isSubstitution: false,
  toRiskCategory: 1, insuredYears: 12, totalNumberOfClaims: 0,
  atrDetails: [{ year: 2025, principale: 0, paritario: 0 }], messages: [],
  installmentPrices: [{
    canBeSaved: true, earlyDiscountExpirationDate: null, earlyDiscountRemainingDays: null,
    installments: [{
      installmentConfiguration: { count: 1, labels: { name: 'annuale' } },
      guarantees: [
        { slug: 'rca', label: 'Responsabilità civile', selected: true, isMandatory: true,
          description: { full: 'RCA' },
          priceBlocks: [{ coveragePrice: { legal: '591.09', presentation: '686.09', full: '768.42', flexibilityMax: '466.47', min: '400', max: '700', taxesPercentage: '15.75' } }] },
        { slug: 'infortuni_conducente', label: 'Infortuni conducente', selected: true, isMandatory: false,
          description: { full: 'IC' },
          priceBlocks: [{ coveragePrice: { legal: '68', full: '68' } }] },
        { slug: 'cristalli', label: 'Cristalli', selected: false, isMandatory: false,
          description: { full: 'CR' },
          priceBlocks: [{ coveragePrice: { legal: '34.46', full: '34.46' } }] },
      ],
    }],
  }],
};
const n = normalizeQuote(raw);
const opt = n.rate[0].opzioni[0];

check('premio = solo garanzie SELEZIONATE (591.09 + 68 = 659.09)',
  () => assert.equal(opt.premio_totale, 659.09));
check('la garanzia non selezionata NON entra nel totale',
  () => assert.ok(opt.premio_totale < 659.09 + 34.46));
check('prezzi convertiti in Number, non stringhe',
  () => assert.equal(typeof opt.garanzie[0].prezzo, 'number'));
check('flessibilita max normalizzata', () => assert.equal(opt.garanzie[0].flessibilita_max, 466.47));
check('classe di merito esposta',      () => assert.equal(n.classe_merito, 1));
check('attestato di rischio conservato',() => assert.equal(n.attestato_rischio.length, 1));
check('frazionamento leggibile',        () => assert.equal(opt.frazionamento, 'annuale'));
check('garanzie obbligatorie marcate',  () => assert.equal(opt.garanzie[0].obbligatoria, true));
check('nessuna garanzia selezionata -> premio null, non 0', () => {
  const alt = JSON.parse(JSON.stringify(raw));
  alt.installmentPrices[0].installments[0].guarantees.forEach(g => { g.selected = false; });
  assert.equal(normalizeQuote(alt).rate[0].opzioni[0].premio_totale, null);
});

console.log(`\n${pass} passati, ${fail} falliti\n`);
process.exit(fail ? 1 : 0);
