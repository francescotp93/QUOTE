// Collaudo del ponte fra la tabella dei parametri e il motore del browser.
// Niente rete e niente database: le due funzioni che contano sono pure.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const M = await import('./parametriPrevidenziali.js').catch(() => ({}));
const manca = (n) => { throw new Error(`server/parametriPrevidenziali.js non esporta ${n}`); };
const avvisiSuiParametri = M.avvisiSuiParametri || (() => manca('avvisiSuiParametri'));
const tabellaCoefficienti = M.tabellaCoefficienti || (() => manca('tabellaCoefficienti'));

const OGGI = new Date('2026-09-03T10:00:00Z');
const SCHEDE = {
  coefficienti_trasformazione: { chiave:'coefficienti_trasformazione', scade_il:'2026-12-31', ricontrolla_il:'2026-11-15',
    fonte:'Decreto 20/11/2024', nota:'Coefficienti 2025-2026', aggiornato_il:'2026-09-03' },
  aliquote_computo: { chiave:'aliquote_computo', derivato:true, ricontrolla_il:'2027-02-15' },
  scaduto: { chiave:'scaduto', scade_il:'2026-06-30' },
  vecchio: { chiave:'vecchio', ricontrolla_il:'2026-02-15' },
};
const VALORI = { coefficienti_trasformazione: { 66: 0.05423, 67: 0.05608 } };

test('un parametro in corso non genera avvisi', () => {
  assert.deepEqual(avvisiSuiParametri(SCHEDE, ['coefficienti_trasformazione'], OGGI), []);
});

test('un parametro scaduto lo dice, con la data', () => {
  const a = avvisiSuiParametri(SCHEDE, ['scaduto'], OGGI);
  assert.equal(a.length, 1);
  assert.match(a[0], /scaduto il 2026-06-30/);
  assert.match(a[0], /valore vecchio/);
});

test('un parametro da ricontrollare e\' un avviso piu\' leggero dello scaduto', () => {
  const a = avvisiSuiParametri(SCHEDE, ['vecchio'], OGGI);
  assert.equal(a.length, 1);
  assert.match(a[0], /ricontrollato il 2026-02-15/);
});

test('un valore derivato viene segnalato ogni volta che si usa', () => {
  const a = avvisiSuiParametri(SCHEDE, ['aliquote_computo'], OGGI);
  assert.equal(a.length, 1);
  assert.match(a[0], /commercialista/);
});

test('un parametro che manca dice che si sta usando la copia di riserva', () => {
  // Il silenzio sarebbe la cosa peggiore: il conto verrebbe fatto lo stesso,
  // con i numeri dentro al programma, e nessuno saprebbe che e' successo.
  const a = avvisiSuiParametri(SCHEDE, ['sparito'], OGGI);
  assert.equal(a.length, 1);
  assert.match(a[0], /copia di riserva/);
});

test('gli avvisi sono testo pronto da stampare, non oggetti da comporre', () => {
  // Il motore li infila nel report cosi' come sono: se fossero oggetti, sul
  // foglio del cliente uscirebbe [object Object].
  for (const a of avvisiSuiParametri(SCHEDE, ['scaduto', 'vecchio', 'aliquote_computo'], OGGI)) {
    assert.equal(typeof a, 'string');
    assert.ok(a.length > 20);
  }
});

// ── La tabella per il motore ─────────────────────────────────────────────────
test('le eta\' arrivano come numeri, non come stringhe', () => {
  /* In JSON le chiavi sono sempre stringhe, e il motore cerca per numero
     (`Object.hasOwnProperty(t, 67)` con 67 numero). Senza questa conversione
     la tabella sembra piena e risponde «eta' fuori tabella» su ogni eta'. */
  const t = tabellaCoefficienti(VALORI, SCHEDE, []);
  assert.equal(t.perEta[67], 0.05608);
  assert.ok(Object.keys(t.perEta).every(k => Number.isFinite(Number(k))));
});

test('la tabella che arriva dall\'archivio e\' verificata, e porta la sua fonte', () => {
  const t = tabellaCoefficienti(VALORI, SCHEDE, []);
  assert.equal(t.daVerificare, false);
  assert.match(t.fonte, /Decreto/);
});

test('il periodo esce dalla scadenza, non da una frase scritta a mano', () => {
  /* Il primo tentativo pescava la prima coppia di anni che trovava nella nota.
     La nota vera dice «Il decreto 2027-2028 non è ancora pubblicato»: la
     tabella si dichiarava del biennio 2027-2028 usando i coefficienti del
     2025-2026, e quella scritta finiva sul report del cliente. */
  const insidiosa = { coefficienti_trasformazione: { chiave:'coefficienti_trasformazione', scade_il:'2026-12-31',
    nota:'Valgono per le pensioni con decorrenza 1/1/2025-31/12/2026. Il decreto 2027-2028 non è ancora pubblicato.' } };
  const t = tabellaCoefficienti(VALORI, insidiosa, []);
  assert.ok(!/2027/.test(t.biennio), 'la tabella si dichiara di un biennio che non è il suo: ' + t.biennio);
  assert.equal(t.biennio, 'in vigore fino al 31/12/2026');
});

test('senza scadenza in tabella non si inventa un periodo', () => {
  const t = tabellaCoefficienti(VALORI, { coefficienti_trasformazione: {} }, []);
  assert.equal(t.biennio, 'in vigore');
});

test('gli avvisi viaggiano dentro la tabella, per arrivare al report', () => {
  const t = tabellaCoefficienti(VALORI, SCHEDE, ['«coefficienti_trasformazione» è scaduto.']);
  assert.equal(t.avvisi.length, 1);
});

test('senza coefficienti in tabella si torna niente, e il motore usa la riserva', () => {
  // Meglio la copia di riserva del programma (che è quella del decreto) che una
  // tabella vuota: una tabella vuota darebbe «età fuori tabella» a tutti.
  assert.equal(tabellaCoefficienti({}, SCHEDE, []), null);
  assert.equal(tabellaCoefficienti({ coefficienti_trasformazione: {} }, SCHEDE, []), null);
  assert.equal(tabellaCoefficienti({ coefficienti_trasformazione: 'boh' }, SCHEDE, []), null);
});

test('un valore non numerico dentro i coefficienti viene scartato, non passato al motore', () => {
  const t = tabellaCoefficienti({ coefficienti_trasformazione: { 67: 0.05608, 68: 'ottantotto' } }, SCHEDE, []);
  assert.equal(t.perEta[67], 0.05608);
  assert.equal(t.perEta[68], undefined);
});

test('le chiavi servite sono quelle che il motore sa usare', () => {
  /* Cresciute il 04/09/2026 con inflazione, componenti reali, curva del
     decadimento e requisiti proiettati: da qui passano TUTTI i numeri che il
     modulo previdenziale non deve tenere dentro al codice. */
  const c = M.CHIAVI_USATE || [];
  for (const k of ['coefficienti_trasformazione', 'tetto_deducibilita', 'tassazione_prestazione',
                   'inflazione_attesa', 'crescita_reale_reddito', 'crescita_reale_pil',
                   'coefficiente_decadimento', 'requisiti_eta_proiettati']) {
    assert.ok(c.includes(k), 'manca la chiave ' + k);
  }
  assert.equal(c.length, 10);
});
