/* ═══════════════════════════════════════════════════════════════════════════
   SCADENZARIO — le prove
   L'errore che costa: richiamare un cliente già rinnovato, o non richiamarne
   uno scaduto perché è finito fuori dalle fasce.
   ═══════════════════════════════════════════════════════════════════════════ */
import { esiti, deve, uguale } from './banco.mjs';
import { fasciaDi, prepara, rinnovoDi, raggruppa, FASCE } from '../moduli/scadenzario.js';

const e = esiti('SCADENZARIO — chi scade e quando');
const OGGI = '2026-07-30';
const p = (x) => ({ id: 'p', cliente: 'Mario Rossi', premio_annuo: 500, stato_pagamento: 'pagato', ...x });

e.prova('le fasce coprono ogni giorno da -infinito a 90 senza buchi', () => {
  for (let g = -200; g <= 90; g++) deve(fasciaDi(g), 'giorno ' + g + ' non sta in nessuna fascia');
  uguale(fasciaDi(91), null, 'oltre i 90 giorni non è ancora lavoro');
  uguale(fasciaDi(null), null);
});

e.prova('le fasce non si sovrappongono', () => {
  for (let g = -5; g <= 90; g++) {
    const dentro = FASCE.filter(f => g >= f.da && g <= f.a);
    uguale(dentro.length, 1, 'il giorno ' + g + ' sta in ' + dentro.length + ' fasce');
  }
});

e.prova('il confine fra le fasce è dove ci si aspetta', () => {
  uguale(fasciaDi(-1), 'scadute');
  uguale(fasciaDi(0), 'sette', 'chi scade oggi è ancora recuperabile');
  uguale(fasciaDi(7), 'sette');
  uguale(fasciaDi(8), 'trenta');
  uguale(fasciaDi(30), 'trenta');
  uguale(fasciaDi(31), 'sessanta');
});

e.prova('le più urgenti stanno in cima', () => {
  const righe = prepara([
    p({ id: 'a', data_scadenza: '2026-08-25' }),
    p({ id: 'b', data_scadenza: '2026-07-20' }),
    p({ id: 'c', data_scadenza: '2026-08-01' })
  ], OGGI);
  uguale(righe.map(r => r.id), ['b', 'c', 'a']);
});

e.prova('senza scadenza non si entra nello scadenzario', () => {
  uguale(prepara([p({ data_scadenza: null })], OGGI).length, 0);
});

e.prova('le annullate non si richiamano', () => {
  uguale(prepara([p({ data_scadenza: '2026-08-01', stato_pagamento: 'annullata' })], OGGI).length, 0);
});

e.prova('oltre i sei mesi di ritardo non è più recupero', () => {
  uguale(prepara([p({ data_scadenza: '2026-07-01' })], OGGI).length, 1);
  uguale(prepara([p({ data_scadenza: '2025-12-01' })], OGGI).length, 0);
});

e.prova('una polizza già sostituita risulta rinnovata', () => {
  uguale(rinnovoDi({ sostituzioni: 1 }).stato, 'ok');
  uguale(rinnovoDi({ sostituzioni: 0, tacito_rinnovo: true }).stato, 'attesa');
  uguale(rinnovoDi({ sostituzioni: 0 }).stato, 'male');
});

e.prova('lo stato del rinnovo si legge anche senza colore', () => {
  ['ok', 'attesa', 'male'].forEach(() => {});
  deve(rinnovoDi({ sostituzioni: 1 }).testo === 'già rinnovata', 'va scritto, non solo colorato');
  deve(rinnovoDi({}).testo === 'da rinnovare', 'va scritto, non solo colorato');
});

e.prova('il raggruppamento salta le fasce vuote e somma i premi', () => {
  const righe = prepara([
    p({ id: 'a', data_scadenza: '2026-07-20', premio_annuo: 100 }),
    p({ id: 'b', data_scadenza: '2026-07-25', premio_annuo: 250 })
  ], OGGI);
  const g = raggruppa(righe);
  uguale(g.length, 1);
  uguale(g[0].chiave, 'scadute');
  uguale(g[0].n, 2);
  uguale(g[0].importo, 350);
});

e.prova('una fascia senza premi non mostra un totale finto', () => {
  const righe = prepara([p({ data_scadenza: '2026-08-01', premio_annuo: null })], OGGI);
  uguale(raggruppa(righe)[0].importo, null);
});

process.exit(e.stampa() === 0 ? 0 : 1);
