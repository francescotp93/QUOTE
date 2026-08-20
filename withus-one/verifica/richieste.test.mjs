/* ═══════════════════════════════════════════════════════════════════════════
   RICHIESTE — le prove
   Quello che deve funzionare: le aperte in cima, le urgenti prima, e quelle
   ferme da giorni impossibili da non vedere.
   ═══════════════════════════════════════════════════════════════════════════ */
import { esiti, deve, uguale } from './banco.mjs';
import { aperta, urgenzaDi, attesaGiorni, ordina, filtra, fasceDa, GIORNI_FERMA } from '../moduli/richieste.js';

const e = esiti('RICHIESTE — la coda verso l\'ufficio');
const OGGI = '2026-07-30';
const r = (x) => ({ id: 'r', titolo: 'Voltura', priorita: 'normale', stato: 'aperto', creato_il: '2026-07-28', ...x });

e.prova('aperta finché non è risolta o chiusa', () => {
  ['aperto', 'in corso', 'in lavorazione'].forEach(s => deve(aperta(r({ stato: s })), s));
  ['risolto', 'chiuso', 'annullato', 'archiviato'].forEach(s => deve(!aperta(r({ stato: s })), s));
});

e.prova('le priorità che ci sono davvero nei dati vengono riconosciute tutte', () => {
  uguale(urgenzaDi({ priorita: 'critica' }).livello, 3);
  uguale(urgenzaDi({ priorita: 'urgente' }).livello, 3);
  uguale(urgenzaDi({ priorita: 'alta' }).livello, 2);
  uguale(urgenzaDi({ priorita: 'normale' }).livello, 1);
  uguale(urgenzaDi({ priorita: 'bassa' }).livello, 0);
});

e.prova('una priorità scritta in un modo nuovo non fa saltare l\'ordine', () => {
  uguale(urgenzaDi({ priorita: 'media' }).livello, 1, 'in mezzo, non in cima e non in fondo');
  uguale(urgenzaDi({}).livello, 1);
});

e.prova('l\'attesa si conta dall\'apertura', () => {
  uguale(attesaGiorni(r({ creato_il: '2026-07-20' }), OGGI), 10);
  uguale(attesaGiorni(r({ creato_il: null }), OGGI), null);
});

e.prova('le aperte stanno sopra le risolte, sempre', () => {
  const l = ordina([r({ id: 'vecchia-risolta', stato: 'risolto', priorita: 'critica', creato_il: '2020-01-01' }),
                    r({ id: 'nuova-aperta', priorita: 'bassa', creato_il: '2026-07-29' })], OGGI);
  uguale(l[0].id, 'nuova-aperta', 'una risolta non è lavoro, per quanto fosse urgente');
});

e.prova('fra due aperte viene prima la più urgente', () => {
  const l = ordina([r({ id: 'a', priorita: 'bassa' }), r({ id: 'b', priorita: 'critica' })], OGGI);
  uguale(l.map(x => x.id), ['b', 'a']);
});

e.prova('a pari urgenza viene prima quella che aspetta da più tempo', () => {
  const l = ordina([r({ id: 'recente', creato_il: '2026-07-29' }), r({ id: 'vecchia', creato_il: '2026-07-01' })], OGGI);
  uguale(l.map(x => x.id), ['vecchia', 'recente']);
});

e.prova('ferma vuol dire aperta da più di una settimana', () => {
  uguale(GIORNI_FERMA, 7);
  const righe = [r({ id: 'a', creato_il: '2026-07-01' }), r({ id: 'b', creato_il: '2026-07-29' }),
                 r({ id: 'c', stato: 'risolto', creato_il: '2020-01-01' })];
  uguale(filtra(righe, { stato: 'ferme' }, OGGI).map(x => x.id), ['a']);
});

e.prova('una risolta da anni non conta come arretrato', () => {
  uguale(filtra([r({ stato: 'risolto', creato_il: '2019-01-01' })], { stato: 'ferme' }, OGGI).length, 0);
});

e.prova('«urgenti» conta solo quelle ancora aperte', () => {
  const righe = [r({ id: 'a', priorita: 'critica' }), r({ id: 'b', priorita: 'critica', stato: 'risolto' })];
  uguale(filtra(righe, { stato: 'urgenti' }, OGGI).map(x => x.id), ['a']);
});

e.prova('la ricerca guarda titolo, testo e chi l\'ha aperta', () => {
  const righe = [r({ titolo: 'Voltura targa', descrizione: 'urgente per lunedì', segnalato_nome: 'Mario Rossi' })];
  uguale(filtra(righe, { q: 'targa' }, OGGI).length, 1);
  uguale(filtra(righe, { q: 'lunedì' }, OGGI).length, 1);
  uguale(filtra(righe, { q: 'rossi' }, OGGI).length, 1);
});

e.prova('le fasce a zero non si mostrano', () => {
  const f = fasceDa([r({})], OGGI);
  deve(f.some(x => x.chiave === 'aperte'), 'c\'è una richiesta aperta');
  deve(!f.some(x => x.chiave === 'risolte'), 'nessuna risolta: la fascia non si mostra');
});

process.exit(e.stampa() === 0 ? 0 : 1);
