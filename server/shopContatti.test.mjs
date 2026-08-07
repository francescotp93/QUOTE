// ═══════════════════════════════════════════════════════════════════════════════
//  I CONTATTI DI UN CLIENTE NON SI RISCRIVONO DA UNA ROTTA PUBBLICA
//
//  `/shop` e' senza login APPOSTA: e' il negozio online, il cliente compra e
//  paga senza avere un account. Ma POST /shop/anagrafica cerca il cliente per
//  codice fiscale e, se lo trova, faceva una PATCH con TUTTI i campi presi
//  dalla richiesta. Chiunque conosca un codice fiscale — e un codice fiscale si
//  calcola da nome, cognome, data e comune di nascita — poteva quindi
//  sostituire email e cellulare di un cliente vero. Da quel momento le
//  comunicazioni dell'agenzia, compresi i link di firma, sarebbero andate a lui.
//
//  Il commento sopra quella PATCH prometteva gia' «senza sovrascrivere cio' che
//  c'e' gia' di rilevante». Il codice non lo faceva: e' una di quelle
//  divergenze che nessuno rilegge, perche' il commento rassicura.
//
//  Nessuna rete, nessun database: si prova la funzione pura che decide.
//
//      node server/shopContatti.test.mjs
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import { campiDaRiempire, CAMPI_CONTATTO } from './shop.js';

const esiti = [];
const prova = (nome, fn) => {
  try { const m = fn(); esiti.push([true, nome, m || '']); }
  catch (e) { esiti.push([false, nome, e.message]); }
};
const deve = (c, msg) => { if (!c) throw new Error(msg); };

/* Dati inventati: nessun cliente vero compare in questo file. */
const INARCHIVIO = {
  email: 'cliente@example.invalid',
  cellulare: '3330000000',
  indirizzo: 'Via Esempio', civico: '1', comune: 'Comune', cap: '00000', provincia: 'XX',
  data_nascita: '1980-01-01',
};

prova('un estraneo non puo\' cambiare l\'email di un cliente gia\' in archivio', () => {
  const proposto = { ...INARCHIVIO, email: 'estraneo@example.invalid', cellulare: '3999999999' };
  const patch = campiDaRiempire(INARCHIVIO, proposto);
  deve(patch.email === undefined, 'l\'email del cliente verrebbe sostituita con quella di chi chiama');
  deve(patch.cellulare === undefined, 'il cellulare del cliente verrebbe sostituito');
  deve(Object.keys(patch).length === 0, 'campi riscritti a sproposito: ' + Object.keys(patch).join(', '));
});

prova('un campo davvero vuoto si riempie: e\' il caso legittimo', () => {
  /* Un cliente in archivio senza cellulare che compra online e lo lascia: e'
     esattamente quello che la rotta deve poter fare. */
  const senzaCell = { ...INARCHIVIO, cellulare: null };
  const patch = campiDaRiempire(senzaCell, { ...INARCHIVIO, cellulare: '3331112222' });
  deve(patch.cellulare === '3331112222', 'un campo vuoto non viene riempito: si perde un dato buono');
  deve(patch.email === undefined, 'insieme al campo vuoto ne ha riscritto uno pieno');
});

prova('una stringa di soli spazi conta come vuota', () => {
  const patch = campiDaRiempire({ ...INARCHIVIO, indirizzo: '   ' }, { ...INARCHIVIO, indirizzo: 'Via Nuova' });
  deve(patch.indirizzo === 'Via Nuova', 'un campo con soli spazi non e\' stato trattato come vuoto');
});

prova('non si svuota un campo pieno mandando una stringa vuota', () => {
  const patch = campiDaRiempire(INARCHIVIO, { ...INARCHIVIO, email: '', cellulare: null });
  deve(Object.keys(patch).length === 0, 'una richiesta con campi vuoti ha cancellato dei dati');
});

prova('tutti i campi di contatto sono coperti', () => {
  /* Se domani si aggiunge un campo alla PATCH senza aggiungerlo qui, resta
     scoperto e torna sovrascrivibile senza che nessuno se ne accorga. */
  const vuoto = {};
  const pieno = Object.fromEntries(CAMPI_CONTATTO.map(k => [k, 'x']));
  const patch = campiDaRiempire(vuoto, pieno);
  deve(Object.keys(patch).length === CAMPI_CONTATTO.length,
    'campi non coperti: ' + CAMPI_CONTATTO.filter(k => !(k in patch)).join(', '));
  return CAMPI_CONTATTO.length + ' campi';
});

prova('la risposta non dice piu\' se quel codice fiscale e\' gia\' cliente', () => {
  /* Era un oracolo su una rotta senza login: mandi un codice fiscale e ti viene
     detto se quella persona ha un rapporto con l'agenzia. Nessuno lo leggeva:
     landing.html usa solo `clienteId`. */
  const src = fs.readFileSync(new URL('./shop.js', import.meta.url), 'utf8');
  const i = src.indexOf("shopRouter.post('/anagrafica'");
  deve(i > 0, 'la rotta /shop/anagrafica non c\'e\' piu\'');
  const rotta = src.slice(i, i + 2600);
  deve(!/esistente:\s*(true|false)/.test(rotta), 'la risposta dichiara ancora se il cliente era gia\' in archivio');
});

let ko = 0;
console.log('\nCONTATTI DAL NEGOZIO ONLINE — riempire si\', riscrivere no');
for (const [ok, nome, msg] of esiti) {
  console.log(ok ? '  ok  ' + nome + (msg ? ' — ' + msg : '') : '  X   ' + nome + ' — ' + msg);
  if (!ok) ko++;
}
console.log(`\nCONTATTI: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
