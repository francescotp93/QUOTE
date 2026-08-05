// ═══════════════════════════════════════════════════════════════════════════════
//  PROVE — i due report
//
//  Il documento del cliente esce dall'agenzia e resta in mano a una persona.
//  Quello d'agenzia contiene valutazioni operative e dati non verificati, e non
//  deve uscire affatto. Le prove qui guardano soprattutto il confine fra i due.
//
//  E guardano una cosa che non si vede leggendo: che il documento sia una
//  FOTOGRAFIA. Stessa analisi, stessa ora, stesso file byte per byte — se non
//  fosse così, l'impronta archiviata non dimostrerebbe niente.
// ═══════════════════════════════════════════════════════════════════════════════
import {
  costruisciSnapshot, reportCliente, reportAgenzia, generaDocumento,
  datiMancanti, idReport, VERSIONE_MOTORE_REPORT,
} from './analisiBisogniReport.js';

const esiti = [];
const prova = (nome, fn) => {
  try { fn(); esiti.push([true, nome, '']); }
  catch (e) { esiti.push([false, nome, e.message]); }
};
const deve = (c, msg) => { if (!c) throw new Error(msg); };

const QUANDO = '2026-08-05T10:00:00.000Z';
const analisi = (extra) => Object.assign({
  id: '11111111-2222-3333-4444-555555555555',
  modalita: 'agenzia', stato: 'firmata', firmata_il: QUANDO,
  versione_privacy: 'PRIV-PROVVISORIA-2026-08',
  risposte: {
    anagrafica: { nome: 'Mario', cognome: 'Rossi', nascita: '1984-06-14', email: 'm.rossi@example.it', telefono: '3331234567' },
    famiglia: 'figli', dipendenzaReddito: 'totale', casa: 'mutuo',
    patrimonio: ['prima_casa'], coperture: ['casa'], copertureConfermate: true,
    interessi: ['famiglia'], note: 'Sta per nascere il secondo figlio.', contatto: 'WhatsApp',
  },
}, extra || {});
const snap = (extra) => costruisciSnapshot({
  analisi: analisi(extra), cliente: { nominativo: 'ROSSI MARIO' },
  operatore: 'Francesco Oddo', generatoIl: QUANDO,
});

// ── 1. La fotografia ───────────────────────────────────────────────────────
prova('stesso input, stesso file byte per byte', () => {
  /* Se il documento cambiasse fra due generazioni, l'impronta archiviata non
     dimostrerebbe niente: non si potrebbe più dire «questo è il file che il
     cliente ha firmato». */
  const a = generaDocumento(snap(), 'cliente');
  const b = generaDocumento(snap(), 'cliente');
  deve(a.sha256 === b.sha256, 'due generazioni identiche danno impronte diverse');
  deve(a.nomeFile === b.nomeFile, 'il nome del file cambia fra due generazioni');
});

prova('lo snapshot porta con sé tutte le versioni', () => {
  const s = snap();
  for (const k of ['versione_regole', 'versione_questionario', 'versione_privacy', 'motore_versione', 'report_id', 'generato_il']) {
    deve(s[k], 'lo snapshot non porta: ' + k);
  }
  deve(s.motore_versione === VERSIONE_MOTORE_REPORT, 'la versione del generatore non è quella dichiarata');
});

prova('il rating viene ricalcolato, non riletto dalla pratica', () => {
  /* Il documento deve nascere dalle risposte, non da un numero che qualcuno
     potrebbe aver scritto nella pratica. */
  const bugiardo = analisi({ rating: { indiceComplessivo: 1, necessita: [] }, indice_complessivo: 1 });
  const s = costruisciSnapshot({ analisi: bugiardo, cliente: {}, generatoIl: QUANDO });
  deve(s.rating.necessita.length === 5, 'il rating non è stato ricalcolato');
  deve(s.rating.indiceComplessivo > 1, 'il documento userebbe un indice scritto a mano nella pratica');
});

prova('l\'identificativo è stabile e leggibile', () => {
  deve(idReport(QUANDO, 'x') === idReport(QUANDO, 'x'), 'lo stesso report cambia identificativo');
  deve(idReport(QUANDO, 'x') !== idReport(QUANDO, 'y'), 'due report diversi hanno lo stesso identificativo');
  deve(/^AB-20260805-[0-9A-F]{5}$/.test(idReport(QUANDO, 'x')), 'formato inatteso: ' + idReport(QUANDO, 'x'));
});

// ── 2. Il confine fra i due documenti ──────────────────────────────────────
prova('al cliente non si propone nulla', () => {
  /* È uno strumento di consulenza. Un prodotto suggerito da un foglio, senza
     nessuno che lo spieghi, è esattamente quello che non deve succedere. */
  const h = reportCliente(snap());
  const senzaNegazioni = h.replace(/non è un preventivo[^.]*\./gi, '');
  for (const spia of ['€', 'premio', 'prezzo', 'sottoscriv', 'acquist', 'tariffa']) {
    deve(!new RegExp(spia, 'i').test(senzaNegazioni), 'il report cliente parla di: ' + spia);
  }
  deve(/non è un preventivo/i.test(h), 'manca il disclaimer');
  deve(/non è una raccomandazione|non .{0,4}una raccomandazione/i.test(h), 'non viene detto che non è una raccomandazione');
});

prova('il report cliente non contiene la roba interna', () => {
  const h = reportCliente(snap());
  for (const spia of ['USO INTERNO', 'Matrice operativa', 'Dati ancora mancanti', 'Domande da fare', 'Traccia per il colloquio']) {
    deve(!h.includes(spia), 'una sezione interna è finita nel report del cliente: ' + spia);
  }
  deve(!h.includes(snap().analisi_id), 'il report cliente espone l\'identificativo interno della pratica');
});

prova('la scheda d\'agenzia si dichiara riservata, in alto e in fondo', () => {
  const h = reportAgenzia(snap());
  deve(/USO INTERNO/.test(h), 'la scheda interna non dice di essere interna');
  deve(/Non consegnare al cliente/i.test(h), 'non viene detto di non consegnarla');
  /* Due volte, perché di un documento stampato si legge la prima pagina e si
     archivia l'ultima. */
  deve((h.match(/USO INTERNO/g) || []).length >= 2, 'l\'avvertenza compare una volta sola');
});

prova('la scheda d\'agenzia dice che cosa manca', () => {
  const h = reportAgenzia(snap());
  deve(/Dati ancora mancanti/.test(h), 'manca la sezione dei dati mancanti');
  deve(/debito residuo/i.test(h), 'con un mutuo dichiarato non viene chiesto il debito residuo');
  deve(/fascicoli/i.test(h), 'con polizze dichiarate non viene chiesto di acquisirne il contenuto');
});

// ── 3. Le domande seguono le risposte ──────────────────────────────────────
prova('la traccia del colloquio cambia col cliente', () => {
  /* Una traccia uguale per tutti è una traccia che non si usa. */
  const conMutuo = reportAgenzia(snap());
  const senzaMutuo = reportAgenzia(costruisciSnapshot({
    analisi: analisi({ risposte: { ...analisi().risposte, casa: 'affitto', coperture: [] } }),
    cliente: {}, generatoIl: QUANDO,
  }));
  deve(/Il mutuo/.test(conMutuo), 'con un mutuo non compaiono le domande sul mutuo');
  deve(!/Il mutuo/.test(senzaMutuo), 'senza mutuo compaiono lo stesso le domande sul mutuo');
  deve(/polizze già presenti/i.test(conMutuo), 'con polizze dichiarate non compaiono le domande sulle polizze');
  deve(!/polizze già presenti/i.test(senzaMutuo), 'senza polizze compaiono lo stesso quelle domande');
});

prova('i dati mancanti dipendono da quello che il cliente ha detto', () => {
  const vuoto = datiMancanti({});
  deve(vuoto.includes('data di nascita'), 'una data di nascita assente non viene segnalata');
  const pieno = datiMancanti(analisi().risposte);
  deve(!pieno.includes('data di nascita'), 'una data di nascita presente viene segnalata come mancante');
  deve(pieno.some(d => /mutuo/i.test(d)), 'col mutuo non si chiede il debito residuo');
});

// ── 4. Autosufficienza ─────────────────────────────────────────────────────
prova('i documenti non caricano niente da fuori', () => {
  /* Un documento che chiede un carattere a un altro sito racconta a quel sito
     quando qualcuno apre l'analisi di un cliente — e fra tre anni, quando
     quel sito non risponde più, si stampa storto. */
  for (const [nome, h] of [['cliente', reportCliente(snap())], ['agenzia', reportAgenzia(snap())]]) {
    const esterni = h.match(/https?:\/\/[^"'\s)]+/g) || [];
    deve(esterni.length === 0, 'il report ' + nome + ' carica da fuori: ' + esterni.join(', '));
    deve(!/<script/i.test(h.replace(/onclick="window\.print\(\)"/g, '')), 'il report ' + nome + ' contiene uno script');
  }
});

prova('si stampano su A4 senza tagliare i riquadri', () => {
  for (const [nome, h] of [['cliente', reportCliente(snap())], ['agenzia', reportAgenzia(snap())]]) {
    deve(/@media print/.test(h), 'il report ' + nome + ' non ha regole di stampa');
    deve(/size:\s*A4/.test(h), 'il report ' + nome + ' non è impostato su A4');
    deve(/page-break-inside:\s*avoid/.test(h), 'nel report ' + nome + ' i riquadri possono spezzarsi a metà pagina');
  }
});

// ── 5. Contenuto del testo ─────────────────────────────────────────────────
prova('il testo del cliente non viene inserito senza filtro', () => {
  /* Le note le scrive il cliente, dalla pagina pubblica: sono testo di uno
     sconosciuto che finisce dentro un documento HTML. */
  const cattivo = analisi();
  cattivo.risposte.note = '<img src=x onerror=alert(1)>';
  const h = reportAgenzia(costruisciSnapshot({ analisi: cattivo, cliente: {}, generatoIl: QUANDO }));
  deve(!/<img/i.test(h), 'il testo scritto dal cliente entra nel documento senza filtro');
  deve(/&lt;img/.test(h), 'il testo del cliente non compare nemmeno neutralizzato');
});

prova('«da verificare» viene spiegato al cliente', () => {
  /* È il fraintendimento più probabile di tutto il documento: blu sembra
     «a posto», e invece vuol dire «nessuno ha ancora letto il contratto». */
  const h = reportCliente(snap());
  deve(/non vuol dire che sei coperto/i.test(h), 'non viene spiegato che «da verificare» non significa coperto');
});

prova('senza priorità il documento lo dice invece di tacere', () => {
  const scarno = costruisciSnapshot({
    analisi: analisi({ risposte: { anagrafica: { nome: 'Anna', cognome: 'Bianchi' } } }),
    cliente: {}, generatoIl: QUANDO,
  });
  const h = reportCliente(scarno);
  deve(/Nessuna area emerge/i.test(h), 'senza priorità il report cliente non dice niente');
  deve(/Nessuna area in priorità/i.test(reportAgenzia(scarno)), 'senza priorità la scheda interna non dice niente');
});

// ── 6. Il file ─────────────────────────────────────────────────────────────
prova('il nome del file non contiene dati sensibili', () => {
  const d = generaDocumento(snap(), 'cliente');
  deve(/^Analisi-bisogni-Mario-Rossi-AB-\d{8}-[0-9A-F]{5}\.html$/.test(d.nomeFile), 'nome inatteso: ' + d.nomeFile);
  deve(!/RSSMRA|@|\d{10}/.test(d.nomeFile), 'il nome del file contiene codice fiscale, email o telefono');
  deve(generaDocumento(snap(), 'agenzia').nomeFile.startsWith('Scheda-interna-'), 'la scheda interna non si distingue dal nome');
});

prova('un tipo di report inventato viene rifiutato', () => {
  let alzato = false;
  try { generaDocumento(snap(), 'commerciale'); } catch { alzato = true; }
  deve(alzato, 'accetta un tipo di report che non esiste');
});

let ko = 0;
console.log('\nANALISI DEI BISOGNI — report');
for (const [ok, nome, msg] of esiti) {
  console.log(ok ? '  ok  ' + nome : '  X   ' + nome + ' — ' + msg);
  if (!ok) ko++;
}
console.log(`\nREPORT: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
