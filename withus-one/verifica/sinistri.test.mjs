/* ═══════════════════════════════════════════════════════════════════════════
   SINISTRI — le prove
   Il rischio vero non è sbagliare un totale: è che un fascicolo resti fermo
   per mesi senza che nessuno se ne accorga.
   ═══════════════════════════════════════════════════════════════════════════ */
import { esiti, deve, uguale } from './banco.mjs';
import { aperto, conti, giacenza, filtra, fasceDa } from '../moduli/sinistri.js';

const e = esiti('SINISTRI — denunce e liquidazioni');
const OGGI = '2026-07-30';

e.prova('aperto finché non è chiuso, comunque lo scriva la compagnia', () => {
  ['aperto', 'in istruttoria', 'in trattativa', ''].forEach(s =>
    deve(aperto({ stato: s }), `«${s}» dovrebbe risultare aperto`));
  ['chiuso', 'Chiuso', 'liquidato', 'respinto', 'archiviato'].forEach(s =>
    deve(!aperto({ stato: s }), `«${s}» dovrebbe risultare chiuso`));
});

e.prova('i conti sommano tutte le partite', () => {
  const c = conti([
    { importo_richiesto: 1000, importo_riservato: 800, importo_liquidato: 300, franchigia: 100 },
    { importo_richiesto: 500, importo_riservato: 400, importo_liquidato: 0, franchigia: 0 }
  ]);
  uguale(c.richiesto, 1500);
  uguale(c.riservato, 1200);
  uguale(c.liquidato, 300);
  uguale(c.franchigia, 100);
  uguale(c.daLiquidare, 900);
});

e.prova('il «da liquidare» non diventa mai negativo', () => {
  /* Liquidato più della riserva significa riserva da aggiornare, non che la
     compagnia ci deve dei soldi indietro. */
  uguale(conti([{ importo_riservato: 100, importo_liquidato: 250 }]).daLiquidare, 0);
});

e.prova('senza partite i conti sono zero, non errore', () => {
  uguale(conti([]).daLiquidare, 0);
  uguale(conti(null).richiesto, 0);
});

e.prova('gli importi in forma di testo si sommano lo stesso', () => {
  uguale(conti([{ importo_liquidato: '150.25' }, { importo_liquidato: '49.75' }]).liquidato, 200);
});

e.prova('la giacenza si conta dalla denuncia, o dall\'accadimento se manca', () => {
  uguale(giacenza({ data_denuncia: '2026-07-20' }, OGGI), 10);
  uguale(giacenza({ data_accadimento: '2026-07-01' }, OGGI), 29);
  uguale(giacenza({}, OGGI), null);
});

e.prova('un fascicolo fermo da oltre 60 giorni si vede subito', () => {
  const righe = [
    { id: 'a', stato: 'aperto', data_denuncia: '2026-01-01' },
    { id: 'b', stato: 'aperto', data_denuncia: '2026-07-20' },
    { id: 'c', stato: 'chiuso', data_denuncia: '2020-01-01' }
  ];
  uguale(filtra(righe, { stato: 'fermi' }, OGGI).map(s => s.id), ['a']);
});

e.prova('un fascicolo chiuso da anni non risulta «fermo»', () => {
  uguale(filtra([{ stato: 'liquidato', data_denuncia: '2019-01-01' }], { stato: 'fermi' }, OGGI).length, 0,
    'è chiuso: non è lavoro arretrato');
});

e.prova('la ricerca guarda contraente, numero e polizza', () => {
  const righe = [{ contraente: 'Mario Rossi', numero_sx: 'SX/2026/1', n_polizza: 'AB/9' }];
  uguale(filtra(righe, { q: 'rossi' }, OGGI).length, 1);
  uguale(filtra(righe, { q: 'sx/2026' }, OGGI).length, 1);
  uguale(filtra(righe, { q: 'ab/9' }, OGGI).length, 1);
});

e.prova('«Tutti» resta, le altre fasce a zero spariscono', () => {
  const f = fasceDa([{ stato: 'aperto', data_denuncia: '2026-07-25' }], OGGI);
  deve(f.some(x => x.chiave === ''), 'serve il modo di togliere il filtro');
  deve(!f.some(x => x.chiave === 'chiusi'), 'nessun chiuso: la fascia non si mostra');
});

process.exit(e.stampa() === 0 ? 0 : 1);
