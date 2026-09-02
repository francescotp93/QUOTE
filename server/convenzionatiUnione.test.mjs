// ═══════════════════════════════════════════════════════════════════════════════
//  QUANDO L'ANAGRAFICA ESISTE GIA'
//
//  PERCHE' ESISTE
//    Il 2 settembre 2026 Francesco ha compilato i dati come associato e si e'
//    sentito rispondere:
//
//      duplicate key value violates unique constraint "idx_anag_cf_unico"
//
//    Non era un guasto: era la verita'. Quella persona era GIA' nel sistema —
//    con un'email diversa, e con quattro preventivi alle spalle. Noi le avevamo
//    creato una scheda nuova perche' al momento dell'iscrizione l'unica cosa
//    che sapevamo era l'email, e quella non combaciava.
//
//    Il codice fiscale e' il momento in cui si scopre. Da li' le due schede si
//    uniscono, e le polizze «gia' in essere» diventano sue senza fare niente.
//
//    MA UNIRE NON VUOL DIRE SOVRASCRIVERE. Su quella riga ci sono polizze e
//    preventivi: un indirizzo cambiato da fuori, senza che nessuno lo guardi,
//    e' una polizza spedita altrove. Si riempiono i vuoti, e le differenze si
//    scrivono perche' qualcuno le legga.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const mod = await import('./convenzionati.js').catch(() => ({}));
const colmare = mod.campiDaColmare || (() => { throw new Error('campiDaColmare non esiste ancora'); });

const QUI = path.dirname(fileURLToPath(import.meta.url));
const senzaCommenti = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
const src = senzaCommenti(fs.readFileSync(path.join(QUI, 'convenzionati.js'), 'utf8'));
const unione = src.slice(src.indexOf('async function unisciAllAnagraficaEsistente'),
                         src.indexOf("convenzionatiRouter_pubblicoAssociati.post('/mia-anagrafica'"));
const salva = src.slice(src.indexOf("convenzionatiRouter_pubblicoAssociati.post('/salva-anagrafica'"));

const esiti = [];
const prova = (n, f) => { try { esiti.push([true, n, f() || '']); } catch (e) { esiti.push([false, n, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

/* La RESIDENZA non passa piu' di qui: ha una strada sua, perche' non si
   sovrappone mai a quella che abbiamo gia' (vedi convenzionatiResidenza).
   Queste prove parlano di tutto il resto, e per questo non nominano piu'
   «comune» e «cap»: continuare a usarli qui vorrebbe dire provare una regola
   con l'unico caso che quella regola non copre. */
const ETICHETTE = [{ k: 'cellulare', et: 'Cellulare' }, { k: 'professione', et: 'Professione' }, { k: 'email', et: 'Email' }];

prova('i campi vuoti si riempiono', () => {
  const { colma } = colmare({ professione: 'Veterinario', cellulare: '' },
                            { professione: 'Veterinario', cellulare: '3331234567', pec: 'a@pec.it' }, ETICHETTE);
  deve(colma.cellulare === '3331234567', 'non riempie un campo che era vuoto');
  deve(colma.pec === 'a@pec.it', 'non riempie un campo che non c\'era proprio');
  return 'quello che mancava adesso c\'e\'';
});

prova('quello che l\'agenzia aveva gia\' NON si sovrascrive', () => {
  /* E' la regola che protegge le polizze: su quella riga ci sono contratti, e
     un indirizzo cambiato da fuori senza che nessuno lo guardi e' una polizza
     spedita altrove. */
  const { colma } = colmare({ professione: 'Veterinario', cellulare: '3924649820' },
                            { professione: 'Medico', cellulare: '3331234567' }, ETICHETTE);
  deve(!('professione' in colma), 'sovrascrive la professione che avevamo gia\'');
  deve(!('cellulare' in colma), 'sovrascrive il numero che avevamo gia\'');
  return 'si riempie, non si riscrive';
});

prova('le differenze si scrivono, non si buttano', () => {
  /* Se una persona dice che il suo numero e' un altro, e' un'informazione: e'
     il motivo per cui qualcuno deve guardarla, non per cui va ignorata. */
  const { diverse } = colmare({ professione: 'Veterinario', cellulare: '3924649820' },
                              { professione: 'Medico', cellulare: '3331234567' }, ETICHETTE);
  deve(diverse.length === 2, 'ne segnala ' + diverse.length + ' invece di 2');
  deve(/Professione/.test(diverse[0]), 'non dice quale campo: ' + diverse[0]);
  deve(/Veterinario/.test(diverse[0]) && /Medico/.test(diverse[0]), 'non dice i due valori: ' + diverse[0]);
  return 'dice quale campo, e tutti e due i valori';
});

prova('una maiuscola o uno spazio non sono una differenza', () => {
  /* Segnalarle riempirebbe le note di rumore, e poi non si legge piu' niente. */
  const { diverse } = colmare({ professione: 'VETERINARIO', email: 'a@b.it' },
                              { professione: '  veterinario ', email: 'A@B.it' }, ETICHETTE);
  deve(diverse.length === 0, 'segnala differenze che non ci sono: ' + diverse.join(' | '));
  return 'si guarda il dato, non come e\' battuto';
});

prova('le note di chi ha lavorato prima non si cancellano', () => {
  deve(/altra\.note \|\| ''/.test(unione), 'riscrive le note del cliente da capo');
  deve(/\+ \(altra\.note \? '\\n\\n' : ''\)/.test(unione), 'attacca la riga nuova a quella vecchia senza staccarla');
  return 'si aggiunge in fondo, non si sostituisce';
});

prova('il gruppo della convenzione segue la persona', () => {
  /* Senza spostarlo, la persona sparirebbe dal gruppo proprio mentre la si
     unisce — e le campagne mirate su quel gruppo non la troverebbero piu'. */
  deve(/quote_gruppi_membri\?anagrafica_id=eq/.test(unione), 'i gruppi restano attaccati alla scheda che sparisce');
  deve(/method: 'DELETE'/.test(unione), 'la persona resta in due gruppi identici');
  return 'chi era nel gruppo ci resta';
});

prova('la scheda doppia si cancella solo se non ci pende niente', () => {
  /* Se qualcuno le avesse gia' attaccato una polizza, cancellarla vorrebbe dire
     perderla: in quel caso resta li', vuota, e non fa danno a nessuno. */
  deve(/quote_polizze\?cliente_id=eq/.test(unione) && /quote_preventivi\?cliente_id=eq/.test(unione),
    'cancella la scheda vecchia senza guardare cosa ci sia attaccato');
  const i = unione.indexOf('quote_polizze?cliente_id=eq');
  const j = unione.indexOf("quote_anagrafiche?id=eq.${encodeURIComponent(vecchia)}`, { method: 'DELETE' }");
  deve(i > -1 && j > i, 'cancella prima di controllare');
  return 'nel dubbio resta, e non perde niente';
});

prova('si guarda PRIMA di scrivere, non dopo l\'errore', () => {
  /* Dopo, il database rifiuta con un messaggio in inglese e la persona resta
     ferma davanti a un errore che non la riguarda. */
  deve(/unisciAllAnagraficaEsistente\(assoc, dati\.codice_fiscale, dati\)/.test(salva), 'non prova a unire');
  const i = salva.indexOf('unisciAllAnagraficaEsistente');
  const j = salva.indexOf('quote_anagrafiche?id=eq.${encodeURIComponent(assoc.anagrafica_id)}');
  deve(i > -1 && (j === -1 || i < j), 'prova a scrivere prima di aver guardato');
  return 'si guarda prima, e non si vede nessun errore in inglese';
});

prova('se l\'unione non riesce, si dice in italiano cosa fare', () => {
  deve(/gi. nel nostro archivio/.test(salva), 'lascia passare il messaggio del database');
  deve(/ci pensiamo noi/.test(salva), 'dice che c\'e\' un problema ma non dice a chi rivolgersi');
  return 'un vicolo cieco con scritto dove si esce';
});

prova('quando succede, resta scritto nel log', () => {
  // Unire due schede e' una cosa che si deve poter ricostruire.
  deve(/console\.log\('\[convenzionati\] anagrafica unita/.test(unione), 'due schede diventano una e non lo sa nessuno');
  return 'si sapra\' quando e con quale';
});

const ko = esiti.filter(e => !e[0]);
console.log('\n── Quando l\'anagrafica esiste gia\' ─────────────────────────');
for (const [ok, n, d] of esiti) console.log((ok ? '  ✅ ' : '  ❌ ') + n + (d ? ' — ' + d : ''));
console.log(ko.length ? '\n🔴 ' + ko.length + ' prove fallite su ' + esiti.length : '\n🟢 ' + esiti.length + '/' + esiti.length + ' prove superate');
process.exit(ko.length ? 1 : 0);
