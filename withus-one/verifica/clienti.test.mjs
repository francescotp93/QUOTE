/* ═══════════════════════════════════════════════════════════════════════════
   CLIENTI — le prove
   Due cose contano: che il cliente si TROVI comunque sia scritto (altrimenti
   si crea un doppione) e che la sua storia sia in ordine di tempo.
   ═══════════════════════════════════════════════════════════════════════════ */
import { esiti, deve, uguale } from './banco.mjs';
import { nomeDi, piatto, cerca, mancanze, cronologia } from '../moduli/clienti.js';

const e = esiti('CLIENTI — anagrafiche e storia');

e.prova('il nome si compone da qualunque forma abbia l\'anagrafica', () => {
  uguale(nomeDi({ nominativo: 'Mario Rossi' }), 'Mario Rossi');
  uguale(nomeDi({ cognome: 'Rossi', nome: 'Mario' }), 'Rossi Mario');
  uguale(nomeDi({ ragione_sociale: 'Edilizia Srl' }), 'Edilizia Srl');
  uguale(nomeDi({}), '(senza nome)', 'una riga muta in elenco non si può cliccare con cognizione');
});

e.prova('la ricerca ignora accenti, maiuscole e apostrofi', () => {
  const righe = [{ nominativo: "D'Amico Èlia" }, { nominativo: 'Bianchi Anna' }];
  uguale(cerca(righe, { q: 'damico' }).length, 1);
  uguale(cerca(righe, { q: "D'AMICO" }).length, 1);
  uguale(cerca(righe, { q: 'delia' }).length, 0);
  uguale(piatto('Sant\'Agata'), 'santagata');
});

e.prova('si cerca anche per codice fiscale, email e telefono', () => {
  const righe = [{ nominativo: 'Mario Rossi', codice_fiscale: 'RSSMRA80A01H501U', email: 'm@r.it', cellulare: '3331234567' }];
  uguale(cerca(righe, { q: 'RSSMRA80' }).length, 1);
  uguale(cerca(righe, { q: '3331234567' }).length, 1);
  uguale(cerca(righe, { q: 'm@r.it' }).length, 1);
});

e.prova('senza ricerca si vedono tutti', () => {
  uguale(cerca([{}, {}], {}).length, 2);
});

e.prova('quello che manca si dice per nome, non con un punteggio', () => {
  const m = mancanze({ nominativo: 'Mario Rossi' });
  deve(m.includes('email') && m.includes('telefono') && m.includes('codice fiscale') && m.includes('indirizzo'),
    'un punteggio non dice che cosa andare a chiedere: ' + m.join(', '));
});

e.prova('a un\'azienda si chiede la partita IVA, non il codice fiscale', () => {
  const m = mancanze({ tipo: 'azienda', ragione_sociale: 'Edilizia Srl' });
  deve(m.includes('partita IVA'), 'a un\'azienda si chiede la partita IVA');
  deve(!m.includes('codice fiscale'), 'chiedere il codice fiscale a una Srl fa perdere tempo');
});

e.prova('un cliente completo non ha niente da chiedere', () => {
  uguale(mancanze({ nominativo: 'Mario Rossi', email: 'm@r.it', cellulare: '333',
    codice_fiscale: 'RSSMRA80A01H501U', indirizzo: 'Via Roma', comune: 'Milano' }), []);
});

e.prova('la PEC vale come email e il fisso come telefono', () => {
  uguale(mancanze({ pec: 'a@pec.it', telefono: '02123', codice_fiscale: 'X', indirizzo: 'Via', comune: 'Milano' }), []);
});

e.prova('la storia è in ordine dal più recente', () => {
  const s = cronologia({
    preventivi: [{ id: 'p', creato_il: '2026-01-10', prodotto: 'RC Auto' }],
    polizze: [{ id: 'q', data_effetto: '2026-06-01', prodotto: 'Casa' }],
    sinistri: [{ id: 's', data_denuncia: '2026-03-15', ramo: 'Auto' }]
  });
  uguale(s.map(x => x.tipo), ['Polizza', 'Sinistro', 'Preventivo']);
});

e.prova('un fatto senza data va in fondo, non in cima', () => {
  const s = cronologia({
    polizze: [{ id: 'a', data_effetto: null, creato_il: null, prodotto: 'Casa' }],
    preventivi: [{ id: 'b', creato_il: '2026-01-10', prodotto: 'RC Auto' }]
  });
  uguale(s[0].tipo, 'Preventivo', 'in cima ci va l\'ultima cosa DATATA');
  uguale(s[1].quando, null);
});

e.prova('ogni fatto della storia porta con sé dove andare', () => {
  const s = cronologia({ polizze: [{ id: 'q1', data_effetto: '2026-06-01' }] });
  uguale(s[0].apri, { chiave: 'polizze', parametri: { id: 'q1' } });
});

e.prova('una rata incassata si chiama incasso, una non incassata resta rata', () => {
  const s = cronologia({ titoli: [
    { id: 'a', stato: 'incassato', incassato_il: '2026-05-01', importo_lordo: 100, polizza_id: 'p' },
    { id: 'b', stato: 'aperto', data_scadenza: '2026-04-01', importo_lordo: 100, polizza_id: 'p' }
  ] });
  uguale(s.map(x => x.tipo), ['Incasso', 'Rata']);
});

e.prova('senza niente da mostrare la storia è vuota, non esplode', () => {
  uguale(cronologia({}).length, 0);
});

e.prova('un preventivo gia\' diventato polizza lo dice', () => {
  const s = cronologia({ preventivi: [{ id: 'p', creato_il: '2026-01-10', prodotto: 'RC Auto', polizza_emessa: true }] });
  deve(/diventato polizza/.test(s[0].testo), 'altrimenti sembra un doppione della polizza sotto');
});

e.prova('una polizza annullata o non pagata lo dice nella storia', () => {
  /* Prima del 30/07/2026 la riga della polizza era identica che fosse in vigore,
     annullata o mai pagata: la storia diceva il contratto, non il suo esito. */
  const ann = cronologia({ polizze: [{ id: 'a', data_effetto: '2026-01-01', prodotto: 'Casa', stato_pagamento: 'annullata' }] });
  deve(/ANNULLATA/.test(ann[0].testo), 'una annullata deve saltare all\'occhio: ' + ann[0].testo);
  const np = cronologia({ polizze: [{ id: 'b', data_effetto: '2026-01-01', prodotto: 'Casa', stato_pagamento: 'non_pagato' }] });
  deve(/non pagata/.test(np[0].testo), 'una non pagata va segnalata: ' + np[0].testo);
  const ok = cronologia({ polizze: [{ id: 'c', data_effetto: '2026-01-01', prodotto: 'Casa', stato_pagamento: 'pagato' }] });
  deve(!/ANNULLATA|non pagata/.test(ok[0].testo), 'quella regolare non si sporca di etichette');
});

process.exit(e.stampa() === 0 ? 0 : 1);
