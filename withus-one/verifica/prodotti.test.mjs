/* ═══════════════════════════════════════════════════════════════════════════
   PRODOTTI — le prove
   Il punto delicato: non dichiarare «calcolato» un prodotto che in realtà si
   manda in richiesta, e non fingere una durata che nessuno ha stabilito.
   ═══════════════════════════════════════════════════════════════════════════ */
import { esiti, deve, uguale } from './banco.mjs';
import { quotazione, durata, compagnieDi, filtra, fasceDa } from '../moduli/prodotti.js';

const e = esiti('PRODOTTI — il catalogo');

e.prova('si dice come si quota, con parole di chi lavora', () => {
  uguale(quotazione({ tipo_quotazione: 'calcola' }).testo, 'premio calcolato');
  uguale(quotazione({ tipo_quotazione: 'richiedi' }).testo, 'su richiesta');
});

e.prova('un prodotto senza modalità dichiarata non diventa «calcola» per difetto', () => {
  const q = quotazione({});
  uguale(q.stato, 'spento');
  deve(/non dichiarat/.test(q.testo), 'chi lo apre deve sapere che il dato manca: ' + q.testo);
});

e.prova('la durata si scrive in anni quando è un multiplo di dodici mesi', () => {
  uguale(durata({ durata_mesi: 12 }).testo, '1 anno');
  uguale(durata({ durata_mesi: 24 }).testo, '2 anni');
  uguale(durata({ durata_mesi: 18 }).testo, '18 mesi');
});

e.prova('senza durata si dice «da confermare», in rosso', () => {
  const d = durata({});
  uguale(d.stato, 'male');
  uguale(d.testo, 'da confermare');
  uguale(durata({ durata_mesi: 0 }).stato, 'male', 'zero mesi non è una durata');
});

e.prova('le compagnie si leggono comunque siano state salvate', () => {
  uguale(compagnieDi({ compagnie: ['Allianz', 'Generali'] }), ['Allianz', 'Generali']);
  uguale(compagnieDi({ compagnie: [{ nome: 'Allianz' }] }), ['Allianz']);
  uguale(compagnieDi({ compagnie: { Allianz: true } }), ['Allianz']);
  uguale(compagnieDi({}), []);
});

e.prova('i prodotti spenti restano fuori dal catalogo, se non li si chiede', () => {
  const righe = [{ id: 'a', nome: 'Casa', attivo: true }, { id: 'b', nome: 'Vecchio', attivo: false }];
  uguale(filtra(righe, {}).map(p => p.id), ['a']);
  uguale(filtra(righe, { come: 'spenti' }).map(p => p.id), ['b']);
});

e.prova('si trovano i buchi del catalogo: quelli senza durata', () => {
  const righe = [{ id: 'a', durata_mesi: 12 }, { id: 'b' }];
  uguale(filtra(righe, { come: 'senza_durata' }).map(p => p.id), ['b']);
});

e.prova('la ricerca guarda anche le compagnie collegate', () => {
  const righe = [{ nome: 'Casa', compagnie: ['Allianz'] }];
  uguale(filtra(righe, { q: 'allianz' }).length, 1);
  uguale(filtra(righe, { q: 'generali' }).length, 0);
});

e.prova('le fasce a zero spariscono, «In catalogo» resta', () => {
  const f = fasceDa([{ nome: 'Casa', tipo_quotazione: 'calcola', durata_mesi: 12 }]);
  deve(f.some(x => x.chiave === ''), 'serve il modo di togliere il filtro');
  deve(!f.some(x => x.chiave === 'spenti'), 'nessun prodotto spento: la fascia non si mostra');
});

process.exit(e.stampa() === 0 ? 0 : 1);
