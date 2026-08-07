// ═══════════════════════════════════════════════════════════════════════════════
//  UN BACKUP VUOTO NON E' UN BACKUP, E NON DEVE CANCELLARE QUELLI VERI
//
//  `runBackup()` scriveva `✅ creato` in ogni caso, e subito dopo ruotava gli
//  archivi tenendo gli ultimi BACKUP_KEEP (14). Non c'era, in nessun punto, un
//  controllo che dentro l'archivio ci fosse qualcosa. Quattro strade portavano
//  allo stesso posto — un archivio vuoto col bollino verde:
//
//    1. `SUPABASE_SERVICE_ROLE_KEY` assente: salta TUTTE le tabelle, salva due
//       file di configurazione, crea l'archivio, scrive ✅;
//    2. `discoverTables()` fallisce e ritorna []: il ciclo non gira nemmeno, il
//       manifesto resta vuoto, l'archivio nasce lo stesso;
//    3. `dumpTable` su una risposta non ok faceva `break` e scriveva comunque
//       le righe che aveva — anche zero — restituendo 0: una tabella che non si
//       e' riusciti a leggere era INDISTINGUIBILE da una tabella davvero vuota;
//    4. lo stesso `break` a meta' paginazione scriveva una tabella PARZIALE e
//       ne riportava il conteggio parziale come se fosse completo.
//
//  Quattordici notti storte di fila e i backup veri sparivano tutti, ognuno
//  sostituito da un ✅ nel registro. E' il genere di difetto che si scopre il
//  giorno in cui serve.
//
//  Qui si prova la funzione pura che dà il giudizio: niente rete, niente disco.
//
//      node server/backupOnesto.test.mjs
// ═══════════════════════════════════════════════════════════════════════════════
import { giudicaBackup, eArchivioBuono, NOME_FALLITO } from './backup.js';

const esiti = [];
const prova = (nome, fn) => {
  try { const m = fn(); esiti.push([true, nome, m || '']); }
  catch (e) { esiti.push([false, nome, e.message]); }
};
const deve = (c, msg) => { if (!c) throw new Error(msg); };

const buono = { tabelle: { quote_anagrafiche: 1200, quote_preventivi: 430, iam_utenti: 12 }, file: ['server/fonti.store.json'] };

prova('un backup con dentro i dati e\' attendibile', () => {
  const g = giudicaBackup(buono, { conChiave: true });
  deve(g.attendibile === true, 'un backup buono e\' stato bocciato: ' + g.motivo);
  deve(g.righe === 1642, 'conteggio righe sbagliato: ' + g.righe);
});

prova('senza chiave di servizio non e\' un backup dei dati', () => {
  /* Strada 1. Salvava solo i due file di configurazione e dichiarava ✅.
     I file cifrati sono utili, ma non sono l'archivio clienti. */
  const g = giudicaBackup({ tabelle: {}, file: ['server/fonti.store.json'] }, { conChiave: false });
  deve(g.attendibile === false, 'senza chiave di servizio l\'archivio e\' passato per buono');
  /* Deve NOMINARE la variabile: e' l'unica cosa che porta alla soluzione.
     «backup fallito» da solo manda a cercare nel posto sbagliato. */
  deve(/SUPABASE_SERVICE_ROLE_KEY/.test(g.motivo), 'il motivo non nomina la variabile mancante: ' + g.motivo);
  deve(!/[A-Za-z0-9+/]{24,}={0,2}/.test(g.motivo), 'il motivo contiene qualcosa che sembra il valore di una chiave');
});

prova('nessuna tabella esportata non e\' un backup', () => {
  /* Strada 2: discoverTables() fallisce e ritorna []. Il ciclo non gira. */
  const g = giudicaBackup({ tabelle: {}, file: [] }, { conChiave: true });
  deve(g.attendibile === false, 'un archivio senza nessuna tabella e\' passato per buono');
});

prova('una tabella che non si e\' riusciti a leggere ferma tutto', () => {
  /* Strada 3, la piu' insidiosa: prima diventava `0`, cioe' esattamente quello
     che scrive una tabella davvero vuota. */
  const g = giudicaBackup({ tabelle: { quote_anagrafiche: 1200, quote_preventivi: 'errore: HTTP 500' }, file: [] }, { conChiave: true });
  deve(g.attendibile === false, 'un archivio con una tabella fallita e\' passato per buono');
  deve(g.tabelle_fallite.includes('quote_preventivi'), 'la tabella fallita non e\' elencata');
  deve(/quote_preventivi/.test(g.motivo), 'il motivo non dice QUALE tabella e\' saltata: ' + g.motivo);
});

prova('tutte le tabelle a zero e\' sospetto, non normale', () => {
  const g = giudicaBackup({ tabelle: { a: 0, b: 0, c: 0 }, file: [] }, { conChiave: true });
  deve(g.attendibile === false, 'un archivio con zero righe in tutto e\' passato per buono');
});

prova('una singola tabella legittimamente vuota non boccia il backup', () => {
  /* Non deve diventare isterico: una tabella vuota per davvero capita. */
  const g = giudicaBackup({ tabelle: { quote_anagrafiche: 1200, log_vuoto: 0 }, file: [] }, { conChiave: true });
  deve(g.attendibile === true, 'una tabella vuota ha bocciato un backup buono: ' + g.motivo);
});

// ── La rotazione: un archivio fallito non deve poter cancellare uno buono ────
prova('un archivio fallito non e\' contato fra i buoni', () => {
  /* La rotazione tiene gli ultimi 14 fra quelli che riconosce come buoni. Se un
     archivio fallito entrasse in quell'elenco, occuperebbe un posto e ne
     spingerebbe fuori uno vero: e' esattamente il modo in cui i backup buoni
     sparivano uno alla volta. */
  deve(eArchivioBuono('withus-20260807-0330.tar.gz') === true, 'un archivio buono non e\' riconosciuto');
  deve(eArchivioBuono(NOME_FALLITO('20260807-0330')) === false,
    'un archivio fallito e\' contato fra i buoni: ruotando ne cancellerebbe uno vero');
});

prova('il nome di un archivio fallito si vede a occhio', () => {
  /* Chi guarda la cartella deve capirlo senza aprire niente. */
  deve(/FALLITO/.test(NOME_FALLITO('20260807-0330')), 'dal nome non si capisce che e\' fallito');
});

prova('nessun altro nome viene scambiato per un backup', () => {
  for (const n of ['withus-.tar.gz', 'withus-abc.tar.gz', 'note.txt', 'withus-20260807-0330.tar.gz.tmp']) {
    deve(eArchivioBuono(n) === false, 'riconosciuto come backup buono: ' + n);
  }
  return '4 nomi scartati';
});

let ko = 0;
console.log('\nBACKUP ONESTO — un archivio vuoto non deve dirsi riuscito');
for (const [ok, nome, msg] of esiti) {
  console.log(ok ? '  ok  ' + nome + (msg ? ' — ' + msg : '') : '  X   ' + nome + ' — ' + msg);
  if (!ok) ko++;
}
console.log(`\nBACKUP: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
