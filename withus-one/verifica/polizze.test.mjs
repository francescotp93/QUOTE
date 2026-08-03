/* ═══════════════════════════════════════════════════════════════════════════
   POLIZZE — le prove dei quattro stati
   Qui si sbaglia in un modo solo: riassumere. Un verde di troppo su una
   polizza scoperta significa un cliente convinto di essere assicurato.
   ═══════════════════════════════════════════════════════════════════════════ */
import { esiti, deve, uguale } from './banco.mjs';
import { semaforiDi, copertura, complete, filtra, fasceDa, numeroDi, pratica } from '../moduli/polizze.js';

const e = esiti('POLIZZE — i quattro stati');
const OGGI = '2026-07-30';
const base = { stato_pagamento: 'pagato', perfezionata: true, rendicontata: true,
               data_effetto: '2026-01-01', data_scadenza: '2027-01-01' };

e.prova('gli stati sono sempre quattro e sempre nello stesso ordine', () => {
  const s = semaforiDi(base, OGGI);
  uguale(s.length, 4);
  deve(/^Pagamento:/.test(s[0].spiega), 'il primo è il pagamento');
  deve(/^Perfezionamento:/.test(s[1].spiega), 'il secondo è il perfezionamento');
  deve(/^Rendicontazione:/.test(s[2].spiega), 'il terzo è la rendicontazione');
  deve(/^Copertura:/.test(s[3].spiega), 'il quarto è la copertura');
});

e.prova('ogni pallino porta la sua spiegazione: il colore da solo non basta', () => {
  semaforiDi({ ...base, stato_pagamento: 'non_pagato', perfezionata: false }, OGGI)
    .forEach(s => deve(s.spiega && s.spiega.length > 6, 'pallino senza spiegazione'));
});

e.prova('gli stati sono indipendenti: pagata ma non perfezionata resta gialla', () => {
  const s = semaforiDi({ ...base, perfezionata: false }, OGGI);
  uguale(s[0].stato, 'ok');
  uguale(s[1].stato, 'attesa');
});

e.prova('non pagata è rossa, sospesa è gialla', () => {
  uguale(semaforiDi({ ...base, stato_pagamento: 'non_pagato' }, OGGI)[0].stato, 'male');
  uguale(semaforiDi({ ...base, stato_pagamento: 'sospeso' }, OGGI)[0].stato, 'attesa');
});

e.prova('una polizza scaduta ieri NON è coperta oggi', () => {
  uguale(copertura({ ...base, data_scadenza: '2026-07-29' }, OGGI).stato, 'male');
});

e.prova('una polizza che scade fra due settimane avvisa prima di diventare rossa', () => {
  uguale(copertura({ ...base, data_scadenza: '2026-08-12' }, OGGI).stato, 'attesa');
  uguale(copertura({ ...base, data_scadenza: '2026-12-01' }, OGGI).stato, 'ok');
});

e.prova('una polizza che deve ancora decorrere non è né coperta né scaduta', () => {
  const c = copertura({ ...base, data_effetto: '2026-09-01', data_scadenza: '2027-09-01' }, OGGI);
  uguale(c.stato, 'attesa');
  deve(/decorre/.test(c.spiega), 'va detto che deve ancora partire');
});

e.prova('senza scadenza non si dichiara una copertura che non si conosce', () => {
  const c = copertura({ ...base, data_scadenza: null, copertura_al: null }, OGGI);
  uguale(c.stato, 'spento');
  deve(/da confermare/.test(c.spiega), 'meglio dire che manca il dato che inventare un verde');
});

e.prova('le date di copertura, se ci sono, vincono su effetto e scadenza', () => {
  /* Una polizza puo' essere prorogata: la copertura vera e' quella, non la
     scadenza contrattuale. */
  const p = { ...base, data_scadenza: '2026-07-01', copertura_al: '2026-12-31' };
  uguale(copertura(p, OGGI).stato, 'ok');
});

e.prova('una polizza annullata non e\' ne\' rossa ne\' verde: e\' spenta', () => {
  const s = semaforiDi({ ...base, stato_pagamento: 'annullata' }, OGGI);
  uguale(s[0].stato, 'spento');
  uguale(s[3].stato, 'spento');
});

e.prova('«a posto» vuol dire tutti e quattro, non tre su quattro', () => {
  uguale(complete([base], OGGI), 1);
  uguale(complete([{ ...base, rendicontata: false }], OGGI), 0, 'tre verdi su quattro non è a posto');
});

e.prova('i filtri trovano esattamente le polizze da lavorare', () => {
  const righe = [
    { ...base, id: 'a' },
    { ...base, id: 'b', stato_pagamento: 'non_pagato' },
    { ...base, id: 'c', perfezionata: false },
    { ...base, id: 'd', data_scadenza: '2026-07-01' }
  ];
  uguale(filtra(righe, { stato: 'da_incassare' }, OGGI).map(p => p.id), ['b']);
  uguale(filtra(righe, { stato: 'da_perfezionare' }, OGGI).map(p => p.id), ['c']);
  uguale(filtra(righe, { stato: 'scoperte' }, OGGI).map(p => p.id), ['d']);
  uguale(filtra(righe, { stato: 'complete' }, OGGI).map(p => p.id), ['a']);
});

e.prova('la ricerca guarda anche il numero e il cliente', () => {
  const righe = [{ ...base, cliente: 'Mario Rossi', numero_polizza: 'AB/123' }];
  uguale(filtra(righe, { q: 'rossi' }, OGGI).length, 1);
  uguale(filtra(righe, { q: 'ab/1' }, OGGI).length, 1);
  uguale(filtra(righe, { q: 'bianchi' }, OGGI).length, 0);
});

e.prova('«Tutte» resta sempre, le altre fasce a zero spariscono', () => {
  const f = fasceDa([base], OGGI);
  deve(f.some(x => x.chiave === ''), 'senza «Tutte» non si torna indietro dal filtro');
  deve(!f.some(x => x.chiave === 'da_incassare'), 'una fascia vuota è solo rumore');
});

/* ── Il numero che si detta al telefono ─────────────────────────────────── */
e.prova('senza numero di polizza NON si spaccia il contatore interno', () => {
  /* Bug del 30/07/2026: al posto del numero mancante compariva «#108», e
     nell'export «108». Quel numero puo' finire dettato a una compagnia o
     scritto su una denuncia, dove non esiste. */
  uguale(numeroDi({ numero_polizza: 'WU/2026/00107', numero: 107 }), 'WU/2026/00107');
  uguale(numeroDi({ numero_polizza: null, numero: 108 }), null, 'niente numero inventato');
  uguale(numeroDi({ numero_polizza: '', numero: 108 }), null, 'nemmeno una stringa vuota vale');
});

e.prova('il numero interno si mostra, ma dice di essere interno', () => {
  uguale(pratica({ numero: 108 }), 'pratica 108');
  uguale(pratica({}), '', 'senza numero non si scrive «pratica undefined»');
});

/* ── Le annullate non sono lavoro ───────────────────────────────────────── */
e.prova('una polizza annullata non entra nelle fasce da lavorare', () => {
  /* Bug del 30/07/2026: restava fra le «da incassare» e mandava a telefonare
     un cliente per una polizza che non esiste piu'. */
  const ann = { ...base, id: 'x', stato_pagamento: 'annullata', perfezionata: false, rendicontata: false };
  uguale(filtra([ann], { stato: 'da_incassare' }, OGGI).length, 0);
  uguale(filtra([ann], { stato: 'da_perfezionare' }, OGGI).length, 0);
  uguale(filtra([ann], { stato: 'da_rendicontare' }, OGGI).length, 0);
  uguale(filtra([ann], { stato: 'complete' }, OGGI).length, 0, 'nemmeno «a posto»: non e\' a posto, e\' finita');
});

e.prova('ma resta visibile senza filtro: serve allo storico', () => {
  const ann = { ...base, id: 'x', stato_pagamento: 'annullata' };
  uguale(filtra([ann], {}, OGGI).length, 1);
});

process.exit(e.stampa() === 0 ? 0 : 1);
