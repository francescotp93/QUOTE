/* ═══════════════════════════════════════════════════════════════════════════
   SCRIVANIA — le prove della logica
   Qui si prova che cosa FINISCE nell'elenco «da fare oggi» e in che ordine.
   Ogni riga di troppo è rumore che nasconde il lavoro vero; ogni riga che
   manca è un insoluto che nessuno recupera.
   ═══════════════════════════════════════════════════════════════════════════ */
import { esiti, deve, uguale } from './banco.mjs';
import { componi, fasceDa, filtra } from '../moduli/scrivania.js';

const e = esiti('SCRIVANIA — il lavoro di oggi');
const OGGI = '2026-07-30';
const pol = (x) => ({ id: 'p1', cliente: 'Mario Rossi', prodotto: 'RC Auto', ...x });

/* ── Titoli ─────────────────────────────────────────────────────────────── */
e.prova('un insoluto è sempre urgente', () => {
  const v = componi({ titoli: [{ id: 't1', polizza_id: 'p1', stato: 'insoluto', data_scadenza: '2026-06-01',
    importo_lordo: '120.50', polizza: pol({}) }] }, OGGI);
  uguale(v.length, 1, 'doveva restare una voce');
  uguale(v[0].urgenza, 'alta');
  uguale(v[0].importo, 120.5, 'l\'importo arriva come testo dal database e va letto come numero');
});

e.prova('una rata scaduta e non incassata è urgente', () => {
  const v = componi({ titoli: [{ id: 't2', polizza_id: 'p1', stato: 'aperto', data_scadenza: '2026-07-20',
    importo_lordo: 50, polizza: pol({}) }] }, OGGI);
  uguale(v[0].genere, 'rata_scaduta');
  uguale(v[0].urgenza, 'alta');
});

e.prova('una rata che scade oggi è già da incassare, non «fra poco»', () => {
  const v = componi({ titoli: [{ id: 't3', polizza_id: 'p1', stato: 'aperto', data_scadenza: OGGI,
    importo_lordo: 50, polizza: pol({}) }] }, OGGI);
  uguale(v[0].genere, 'rata_scaduta');
});

e.prova('una rata fra 3 giorni si vede, una fra 20 no', () => {
  const fai = (d) => componi({ titoli: [{ id: 't', polizza_id: 'p1', stato: 'aperto', data_scadenza: d,
    importo_lordo: 50, polizza: pol({}) }] }, OGGI);
  uguale(fai('2026-08-02').length, 1, 'quella vicina deve comparire');
  uguale(fai('2026-08-02')[0].urgenza, 'media');
  uguale(fai('2026-08-19').length, 0, 'quella lontana non è lavoro di oggi');
});

e.prova('una rata già incassata non compare', () => {
  const v = componi({ titoli: [{ id: 't4', polizza_id: 'p1', stato: 'incassato', data_scadenza: '2026-01-01',
    importo_lordo: 50, polizza: pol({}) }] }, OGGI);
  uguale(v.length, 0);
});

/* ── Polizze ────────────────────────────────────────────────────────────── */
e.prova('una polizza scaduta va rinnovata, ed è urgente', () => {
  const v = componi({ polizze: [pol({ data_scadenza: '2026-07-10', premio_annuo: 400 })] }, OGGI);
  uguale(v[0].genere, 'polizza_scaduta');
  uguale(v[0].urgenza, 'alta');
  uguale(v[0].giorni, -20);
});

e.prova('una polizza che scade fra 20 giorni si prepara, fra 60 no', () => {
  uguale(componi({ polizze: [pol({ data_scadenza: '2026-08-19' })] }, OGGI).length, 1);
  uguale(componi({ polizze: [pol({ data_scadenza: '2026-09-28' })] }, OGGI).length, 0);
});

e.prova('una polizza scaduta da più di tre mesi non è più lavoro, è storia', () => {
  uguale(componi({ polizze: [pol({ data_scadenza: '2026-01-10' })] }, OGGI).length, 0);
});

e.prova('senza data di scadenza non è un ritardo: non si inventa una data', () => {
  uguale(componi({ polizze: [pol({ data_scadenza: null })] }, OGGI).length, 0);
});

e.prova('una polizza già sostituita è stata rinnovata: non si richiede', () => {
  uguale(componi({ polizze: [pol({ data_scadenza: '2026-08-05', sostituzioni: 1 })] }, OGGI).length, 0);
  uguale(componi({ polizze: [pol({ data_scadenza: '2026-08-05', sostituzioni: 0 })] }, OGGI).length, 1);
});

/* ── Documenti ──────────────────────────────────────────────────────────── */
e.prova('manca solo ciò che è obbligatorio e non c\'è', () => {
  const doc = (x) => ({ entita: 'polizza', entita_id: 'p1', categoria: 'identita', ...x });
  uguale(componi({ documenti: [doc({ obbligatorio: true, url: null })] }, OGGI).length, 1);
  uguale(componi({ documenti: [doc({ obbligatorio: true, url: 'https://x/y.pdf' })] }, OGGI).length, 0,
    'se c\'è, non manca');
  uguale(componi({ documenti: [doc({ obbligatorio: false, url: null })] }, OGGI).length, 0,
    'un facoltativo che manca nasconderebbe quelli veri');
});

/* ── Richieste ──────────────────────────────────────────────────────────── */
e.prova('una richiesta ad alta priorità sale in cima', () => {
  const v = componi({ ticket: [{ id: 'k1', titolo: 'Volturazione', priorita: 'alta', stato: 'aperto' }] }, OGGI);
  uguale(v[0].urgenza, 'alta');
});

e.prova('una richiesta normale resta media', () => {
  const v = componi({ ticket: [{ id: 'k2', titolo: 'Duplicato', priorita: 'bassa', stato: 'aperto' }] }, OGGI);
  uguale(v[0].urgenza, 'media');
});

/* ── Ordine ─────────────────────────────────────────────────────────────── */
e.prova('prima l\'urgente, poi il più in ritardo, e in fondo ciò che non ha data', () => {
  const v = componi({
    polizze: [pol({ id: 'a', data_scadenza: '2026-08-20' }),          // media, +21
              pol({ id: 'b', data_scadenza: '2026-07-01' }),          // alta,  -29
              pol({ id: 'c', data_scadenza: '2026-07-25' })],         // alta,  -5
    documenti: [{ entita: 'polizza', entita_id: 'z', categoria: 'privacy', obbligatorio: true, url: null }]
  }, OGGI);
  uguale(v.map(x => x.giorni), [-29, -5, 21, null], 'ordine sbagliato');
});

/* ── Fasce ──────────────────────────────────────────────────────────────── */
e.prova('le fasce a zero non si mostrano', () => {
  const v = componi({ titoli: [{ id: 't', polizza_id: 'p1', stato: 'insoluto', data_scadenza: '2026-06-01',
    importo_lordo: 10, polizza: pol({}) }] }, OGGI);
  const f = fasceDa(v);
  uguale(f.length, 1, 'doveva restare solo la fascia degli insoluti');
  uguale(f[0].chiave, 'insoluto');
});

e.prova('la fascia somma i soldi che rappresenta', () => {
  const t = (i) => ({ id: 'x' + i, polizza_id: 'p1', stato: 'insoluto', data_scadenza: '2026-06-01',
    importo_lordo: i, polizza: pol({}) });
  const f = fasceDa(componi({ titoli: [t(10), t(32.5)] }, OGGI));
  uguale(f[0].n, 2);
  uguale(f[0].importo, 42.5);
});

e.prova('una fascia senza soldi non mostra un importo finto', () => {
  const f = fasceDa(componi({ ticket: [{ id: 'k', titolo: 'X', priorita: 'bassa', stato: 'aperto' }] }, OGGI));
  uguale(f[0].importo, null, 'meglio niente che un € 0,00 che non significa niente');
});

e.prova('la fascia «rate» tiene insieme quelle scadute e quelle vicine', () => {
  const v = componi({ titoli: [
    { id: 'a', polizza_id: 'p1', stato: 'aperto', data_scadenza: '2026-07-01', importo_lordo: 10, polizza: pol({}) },
    { id: 'b', polizza_id: 'p1', stato: 'aperto', data_scadenza: '2026-08-02', importo_lordo: 10, polizza: pol({}) }
  ] }, OGGI);
  uguale(filtra(v, 'rate').length, 2);
  uguale(filtra(v, null).length, 2, 'senza fascia scelta si vede tutto');
});

/* ── Robustezza ─────────────────────────────────────────────────────────── */
e.prova('senza dati non esplode e non mostra niente', () => {
  uguale(componi({}, OGGI).length, 0);
  uguale(fasceDa([]).length, 0);
});

e.prova('un cliente senza nome si dice, non si lascia in bianco', () => {
  const v = componi({ polizze: [{ id: 'p9', data_scadenza: '2026-08-01' }] }, OGGI);
  deve(/Cliente non indicato/.test(v[0].sotto), 'una riga muta non si sa a chi telefonare');
});

process.exit(e.stampa() === 0 ? 0 : 1);
