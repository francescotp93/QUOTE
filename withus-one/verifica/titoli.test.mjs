/* ═══════════════════════════════════════════════════════════════════════════
   TITOLI — le prove della catena del denaro
   Qui un errore è un errore contabile: un euro contato due volte o non
   contato è un euro che non torna con l'estratto conto.
   ═══════════════════════════════════════════════════════════════════════════ */
import { esiti, deve, uguale } from './banco.mjs';
import { statoDi, daIncassare, incassato, filtra, fasceDa } from '../moduli/titoli.js';

const e = esiti('TITOLI — rate, quietanze e insoluti');
const OGGI = '2026-07-30';
const t = (x) => ({ id: 't', polizza_id: 'p1', tipo: 'rata', importo_lordo: 100, stato: 'aperto', ...x });

e.prova('una rata scaduta si distingue da una ancora da incassare', () => {
  uguale(statoDi(t({ data_scadenza: '2026-07-01' }), OGGI).chiave, 'scaduto');
  uguale(statoDi(t({ data_scadenza: '2026-09-01' }), OGGI).chiave, 'aperto');
});

e.prova('lo stato si dice in italiano, con i giorni di ritardo', () => {
  const s = statoDi(t({ data_scadenza: '2026-07-29' }), OGGI);
  uguale(s.testo, 'scaduta da 1 giorno', 'al telefono «aperto» non significa niente');
});

e.prova('una rata che scade oggi non è ancora in ritardo', () => {
  uguale(statoDi(t({ data_scadenza: OGGI }), OGGI).chiave, 'aperto');
});

e.prova('insoluto e stornato non dipendono dalla data', () => {
  uguale(statoDi(t({ stato: 'insoluto', data_scadenza: '2027-01-01' }), OGGI).chiave, 'insoluto');
  uguale(statoDi(t({ stato: 'stornato', data_scadenza: '2020-01-01' }), OGGI).chiave, 'stornato');
});

e.prova('il credito somma aperte e insolute, e nient\'altro', () => {
  const righe = [t({ importo_lordo: 100 }), t({ stato: 'insoluto', importo_lordo: 50 }),
                 t({ stato: 'incassato', importo_lordo: 999 }), t({ stato: 'stornato', importo_lordo: 999 })];
  uguale(daIncassare(righe), 150);
});

e.prova('le stornate non gonfiano il credito', () => {
  uguale(daIncassare([t({ stato: 'stornato', importo_lordo: 1000 })]), 0,
    'una rata annullata non è un credito verso nessuno');
});

e.prova('l\'incassato conta solo ciò che è davvero entrato', () => {
  uguale(incassato([t({ stato: 'incassato', importo_lordo: 80 }), t({ importo_lordo: 500 })]), 80);
});

e.prova('gli importi arrivano come testo dal database e vanno sommati come numeri', () => {
  uguale(daIncassare([t({ importo_lordo: '10.50' }), t({ importo_lordo: '0.50' })]), 11);
});

e.prova('un importo illeggibile vale zero, non rompe il totale', () => {
  uguale(daIncassare([t({ importo_lordo: null }), t({ importo_lordo: 'boh' }), t({ importo_lordo: 20 })]), 20);
});

e.prova('si filtra per polizza e per periodo di scadenza', () => {
  const righe = [t({ id: 'a', polizza_id: 'p1', data_scadenza: '2026-03-01' }),
                 t({ id: 'b', polizza_id: 'p2', data_scadenza: '2026-08-01' })];
  uguale(filtra(righe, { polizza: 'p1' }, OGGI).map(x => x.id), ['a']);
  uguale(filtra(righe, { dal: '2026-06-01' }, OGGI).map(x => x.id), ['b']);
  uguale(filtra(righe, { al: '2026-06-01' }, OGGI).map(x => x.id), ['a']);
});

e.prova('la ricerca guarda dentro la polizza collegata', () => {
  const righe = [t({ polizza: { cliente: 'Mario Rossi', numero_polizza: 'AB/1' } })];
  uguale(filtra(righe, { q: 'rossi' }, OGGI).length, 1);
  uguale(filtra(righe, { q: 'bianchi' }, OGGI).length, 0);
});

e.prova('le fasce a zero non si mostrano, e le altre portano i soldi', () => {
  const f = fasceDa([t({ stato: 'insoluto', importo_lordo: 60 }), t({ stato: 'insoluto', importo_lordo: 40 })], OGGI);
  uguale(f.length, 1);
  uguale(f[0].chiave, 'insoluto');
  uguale(f[0].importo, 100);
});

process.exit(e.stampa() === 0 ? 0 : 1);
