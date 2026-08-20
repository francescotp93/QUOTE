// Test di verifica su dati REALI (anonimizzati) presi dal portale.
// Valore atteso incrociato con quanto mostra la UI di Prima.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { normalize } from '../src/normalize.js';

const fx = JSON.parse(fs.readFileSync(new URL('./fixtures.json', import.meta.url)));
let pass = 0, fail = 0;
const check = (name, fn) => {
  try { fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message}`); }
};

console.log('\n--- MOTOR (BL716506676) ---');
const m = normalize(fx.motor);
check('premio = somma coverageAmounts.legal = 210.33 (== UI "€ 210,33 / Anno")',
  () => assert.equal(m.premium_legal, 210.33));
check('premio pieno = 300.66', () => assert.equal(m.premium_full, 300.66));
check('prezzo di presentazione = 210.33', () => assert.equal(m.premium_presentation, 210.33));
check('product_type = MOTOR', () => assert.equal(m.product_type, 'MOTOR'));
check('vehicle_type = MOTORCYCLE', () => assert.equal(m.vehicle_type, 'MOTORCYCLE'));
check('quote_type = RENEWAL_PROPOSAL', () => assert.equal(m.quote_type, 'RENEWAL_PROPOSAL'));
check('guide_type = EXPERT', () => assert.equal(m.guide_type, 'EXPERT'));
check('2 garanzie normalizzate', () => assert.equal(m.guarantees.length, 2));
check('garanzia RCA a 140.33', () => assert.equal(m.guarantees[0].prezzo, 140.33));
check('<br /> ripulito dal dettaglio', () => assert.ok(!/<br/i.test(m.guarantees[0].dettaglio)));
check('payment_frequency = annuale', () => assert.equal(m.payment_frequency, 'annuale'));
check('reference_hash valorizzato e reference in chiaro conservato',
  () => { assert.ok(m.reference_hash?.length === 64); assert.equal(m.reference, 'XX000XX'); });

console.log('\n--- HOME (PC10396669) ---');
const h = normalize(fx.home);
check('premio = selection.fullPrice.amount = 65.00', () => assert.equal(h.premium_legal, 65));
check('product_type = HOME', () => assert.equal(h.product_type, 'HOME'));
check('issuing_company = great_lakes', () => assert.equal(h.issuing_company, 'great_lakes'));
check('payment_frequency = YEARLY', () => assert.equal(h.payment_frequency, 'YEARLY'));
check('1 garanzia estratta dai cluster', () => assert.equal(h.guarantees.length, 1));
check('effective_date null non rompe la normalizzazione', () => assert.equal(h.effective_date, null));
check('vehicle_type null su ramo Casa', () => assert.equal(h.vehicle_type, null));

console.log('\n--- Idempotenza / hash ---');
check('content_hash stabile tra due normalizzazioni identiche',
  () => assert.equal(normalize(fx.motor).content_hash, normalize(fx.motor).content_hash));
check('content_hash cambia se cambia il premio', () => {
  const alt = JSON.parse(JSON.stringify(fx.motor));
  alt.productData.installmentPrices[0].coverageAmounts.legal = '999.99';
  assert.notEqual(normalize(alt).content_hash, m.content_hash);
});
check('content_hash NON cambia se cambia solo un campo non-business del raw', () => {
  const alt = JSON.parse(JSON.stringify(fx.motor));
  alt.__extraneo = 'x';
  assert.equal(normalize(alt).content_hash, m.content_hash);
});

console.log(`\n${pass} passati, ${fail} falliti\n`);
process.exit(fail ? 1 : 0);
