/* ═══════════════════════════════════════════════════════════════════════════
   PREVENTIVI — le prove
   Un preventivo vecchio riproposto tale e quale è un prezzo promesso e non
   mantenuto: qui si prova che si veda che è vecchio.
   ═══════════════════════════════════════════════════════════════════════════ */
import { esiti, deve, uguale } from './banco.mjs';
import { eta, statoDi, filtra, fasceDa, resa, GIORNI_VALIDITA } from '../moduli/preventivi.js';

const e = esiti('PREVENTIVI — le quotazioni salvate');
const OGGI = '2026-07-30';
const p = (x) => ({ id: 'p', cliente: 'Mario Rossi', prodotto: 'RC Auto', premio: 400, creato_il: '2026-07-25', ...x });

e.prova('l\'età si conta in giorni dalla creazione', () => {
  uguale(eta(p({ creato_il: '2026-07-20' }), OGGI), 10);
  uguale(eta(p({ creato_il: null }), OGGI), null);
});

e.prova('un preventivo fresco è in lavorazione, uno vecchio va riquotato', () => {
  uguale(statoDi(p({ creato_il: '2026-07-25' }), OGGI).chiave, 'aperto');
  uguale(statoDi(p({ creato_il: '2026-05-01' }), OGGI).chiave, 'vecchio');
});

e.prova('il confine è a trenta giorni esatti', () => {
  const fra = (g) => {
    const d = new Date(Date.parse(OGGI + 'T00:00:00Z') - g * 86400000).toISOString().slice(0, 10);
    return statoDi(p({ creato_il: d }), OGGI).chiave;
  };
  uguale(GIORNI_VALIDITA, 30);
  uguale(fra(30), 'aperto', 'il trentesimo giorno è ancora valido');
  uguale(fra(31), 'vecchio');
});

e.prova('un preventivo diventato polizza non invecchia più', () => {
  uguale(statoDi(p({ creato_il: '2024-01-01', polizza_emessa: true }), OGGI).chiave, 'emesso',
    'ha già fatto il suo lavoro: non è arretrato');
});

e.prova('i filtri trovano quelli da riprendere in mano', () => {
  const righe = [p({ id: 'a' }), p({ id: 'b', creato_il: '2026-01-01' }), p({ id: 'c', polizza_emessa: true })];
  uguale(filtra(righe, { stato: 'vecchio' }, OGGI).map(x => x.id), ['b']);
  uguale(filtra(righe, { stato: 'emesso' }, OGGI).map(x => x.id), ['c']);
  uguale(filtra(righe, { stato: 'aperto' }, OGGI).map(x => x.id), ['a']);
});

e.prova('si può restringere a un cliente o a un prodotto', () => {
  const righe = [p({ id: 'a', cliente_id: 'c1', prodotto_id: 'x' }), p({ id: 'b', cliente_id: 'c2' })];
  uguale(filtra(righe, { cliente: 'c1' }, OGGI).map(x => x.id), ['a']);
  uguale(filtra(righe, { prodotto: 'x' }, OGGI).map(x => x.id), ['a']);
});

e.prova('la resa è la percentuale che diventa polizza', () => {
  uguale(resa([p({ polizza_emessa: true }), p({}), p({}), p({})]), 25);
});

e.prova('senza preventivi la resa non esiste: non è zero per cento', () => {
  uguale(resa([]), null, 'mostrare 0% dove non c\'è nulla da misurare è falso e scoraggia');
});

e.prova('le fasce portano anche i soldi quotati', () => {
  const f = fasceDa([p({ premio: 300 }), p({ premio: 200 })], OGGI);
  const aperte = f.find(x => x.chiave === 'aperto');
  uguale(aperte.n, 2);
  uguale(aperte.importo, 500);
});

e.prova('«Tutti» resta sempre, le fasce vuote no', () => {
  const f = fasceDa([p({})], OGGI);
  deve(f.some(x => x.chiave === ''), 'serve il modo di togliere il filtro');
  deve(!f.some(x => x.chiave === 'emesso'), 'nessuno emesso: la fascia non si mostra');
});

process.exit(e.stampa() === 0 ? 0 : 1);
