// ═══════════════════════════════════════════════════════════════════════════════
//  «SCEGLI» — LA RICHIESTA DI QUOTAZIONE
//
//  PERCHE' ESISTE
//    Fino a oggi «Scegli» apriva un avviso che diceva «lo stiamo completando».
//    Adesso apre una richiesta vera: arriva ad amministrazione, si vede nel
//    pannello, e l'associato riceve la conferma che e' partita.
//
//    Le domande da fare le decide il PANNELLO, prodotto per prodotto. E' la
//    scelta che rende utile la cosa — un prodotto nuovo non ha bisogno di una
//    riga di codice per chiedere la targa invece della professione — ma apre
//    due buchi che queste prove tengono chiusi:
//
//      · si accetta solo quello che il prodotto ha CHIESTO. Senza, chiunque
//        potrebbe spedire mezzo megabyte di roba a caso e ce la ritroveremmo
//        salvata e stampata dentro un'email;
//      · il prodotto si RILEGGE dal database. Nel browser il nome e la
//        convenzione si cambiano in dieci secondi: senza rilettura si potrebbe
//        chiedere un prodotto di un'altra convenzione.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
/* Si importa COSI' e non con `import { rispostePulite }`: sul codice vecchio
   quella riga fa schiantare il file prima ancora di cominciare, e la prova
   diventa una schermata di errore invece di dieci righe che dicono che cosa
   manca. Una controprova serve a leggersi, non solo a essere rossa. */
const mod = await import('./convenzionati.js').catch(() => ({}));
const rispostePulite = mod.rispostePulite || (() => { throw new Error('rispostePulite non esiste ancora'); });

const QUI = path.dirname(fileURLToPath(import.meta.url));
/* SI GUARDA IL CODICE, NON I COMMENTI: il commento qui sopra racconta cosa si
   deve fare, e una prova che leggesse anche quello si accenderebbe sulla
   spiegazione invece che sulla cosa. */
const senzaCommenti = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
const src = senzaCommenti(fs.readFileSync(path.join(QUI, 'convenzionati.js'), 'utf8'));
const rotta = src.slice(src.indexOf("convenzionatiRouter_pubblicoAssociati.post('/richiesta'"));

const esiti = [];
const prova = (n, f) => { try { esiti.push([true, n, f() || '']); } catch (e) { esiti.push([false, n, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

const CAMPI = [
  { k: 'targa', etichetta: 'Targa', tipo: 'testo', obbligatorio: true },
  { k: 'nascita', etichetta: 'Data di nascita', tipo: 'data', obbligatorio: true },
  { k: 'note_auto', etichetta: 'Note sul veicolo', tipo: 'lungo', obbligatorio: false },
];

prova('si tiene solo quello che il prodotto ha chiesto', () => {
  const { dentro } = rispostePulite(CAMPI, {
    targa: 'AB123CD', nascita: '1980-01-01',
    ruolo: 'top_master', premio: '1', __proto__: 'x', roba: 'y'.repeat(9000),
  });
  deve(dentro.targa === 'AB123CD', 'perde una risposta che era stata chiesta');
  deve(!('ruolo' in dentro) && !('premio' in dentro) && !('roba' in dentro),
    'salva anche quello che nessuno ha chiesto: ' + Object.keys(dentro).join(', '));
  return 'tre campi chiesti, tre campi salvati';
});

prova('quello che manca si dice con l\'etichetta che ha visto lui', () => {
  /* «Manca ancora: nascita» non vuol dire niente per chi ha appena compilato un
     modulo dove c'era scritto «Data di nascita». Un messaggio che non si
     riconosce fa premere di nuovo Invia, non correggere. */
  const { mancano } = rispostePulite(CAMPI, { targa: 'AB123CD' });
  deve(mancano.length === 1, 'conta male quello che manca: ' + JSON.stringify(mancano));
  deve(mancano[0] === 'Data di nascita', 'lo chiama col nome tecnico: ' + mancano[0]);
  return 'dice «Data di nascita», non «nascita»';
});

prova('i campi non obbligatori possono restare vuoti', () => {
  const { dentro, mancano } = rispostePulite(CAMPI, { targa: 'AB123CD', nascita: '1980-01-01', note_auto: '   ' });
  deve(mancano.length === 0, 'pretende un campo facoltativo: ' + mancano.join(', '));
  deve(!('note_auto' in dentro), 'salva una riga di spazi come se fosse una risposta');
  return 'facoltativo vuol dire facoltativo';
});

prova('una risposta lunghissima si taglia invece di passare intera', () => {
  const { dentro } = rispostePulite([{ k: 'x', etichetta: 'X' }], { x: 'a'.repeat(50000) });
  deve(dentro.x.length <= 500, 'salva ' + dentro.x.length + ' caratteri in un campo solo');
  return 'al massimo 500 caratteri per risposta';
});

prova('un prodotto senza campi non chiede niente e non si blocca', () => {
  // E' il caso normale finche' Francesco non compila l'elenco delle domande.
  for (const c of [undefined, null, [], 'roba']) {
    const { dentro, mancano } = rispostePulite(c, { qualcosa: 'x' });
    deve(mancano.length === 0 && Object.keys(dentro).length === 0, 'si comporta male con ' + JSON.stringify(c));
  }
  return 'nessuna domanda, nessun ostacolo';
});

prova('il prodotto si rilegge dal database, non si crede al browser', () => {
  deve(/rest\/v1\/quote_convenzione_prodotti\?id=eq\./.test(rotta), 'usa il prodotto come e\' arrivato dal browser');
  deve(/prod\.convenzione_id !== assoc\.convenzione_id/.test(rotta),
    'non controlla che il prodotto sia della SUA convenzione: si potrebbe chiedere quello di un\'altra');
  deve(/!prod\.attivo/.test(rotta), 'accetta richieste su un prodotto che abbiamo nascosto');
  return 'nome, convenzione e stato li dice il database';
});

prova('il nome del prodotto resta scritto nella richiesta', () => {
  /* Fra un anno il prodotto puo' essere stato rinominato. Una richiesta deve
     poter dire che cosa era stato chiesto ALLORA, senza andare a indovinare. */
  deve(/prodotto_nome: prod\.nome/.test(rotta), 'la richiesta non conserva il nome del prodotto di quel giorno');
  return 'si sapra\' sempre che cosa aveva chiesto';
});

prova('se l\'email non parte, la richiesta resta salvata', () => {
  /* Il contrario — avvisare di una richiesta non salvata — manda ad aprire il
     pannello per cercare una riga che non esiste. */
  const salva = rotta.indexOf('/rest/v1/quote_convenzione_richieste');
  const avvisa = rotta.indexOf('inviaEmail(STAFF_INBOX');
  deve(salva > -1 && avvisa > salva, 'avvisa prima di salvare');
  const dopo = rotta.slice(avvisa - 200);
  deve(/catch \(e\) \{ console\.warn\('\[convenzionati\] avviso allo staff non partito/.test(dopo),
    'un\'email che non parte fa fallire tutta la richiesta');
  return 'prima si salva, poi si avvisa';
});

prova('l\'associato riceve la conferma che e\' partita', () => {
  // Chi non riceve niente riprova, e la stessa richiesta arriva tre volte.
  deve(/inviaEmail\(assoc\.email/.test(rotta), 'nessuna conferma a chi ha compilato');
  deve(/emailRichiestaRicevuta/.test(rotta), 'manda qualcosa, ma non la conferma');
  return 'niente dubbio «sara\' partita?»';
});

prova('nell\'email allo staff le risposte hanno la loro domanda', () => {
  /* Una lista di chiavi tecniche in ordine sparso costringe chi legge a
     ricostruire che cosa era stato chiesto. */
  const t = senzaCommenti(fs.readFileSync(path.join(QUI, 'convenzionati.js'), 'utf8'));
  const f = t.slice(t.indexOf('export function emailRichiestaQuotazione'), t.indexOf('export function emailRichiestaRicevuta'));
  deve(/campi\s*\)\s*\?\s*campi/.test(f) || /Array\.isArray\(campi\)/.test(f), 'stampa le risposte senza guardare le domande');
  deve(/c\.etichetta \|\| c\.k/.test(f), 'stampa la chiave tecnica invece dell\'etichetta');
  return 'si legge nell\'ordine in cui e\' stato chiesto';
});

const ko = esiti.filter(e => !e[0]);
console.log('\n── «Scegli»: la richiesta di quotazione ─────────────────────');
for (const [ok, n, d] of esiti) console.log((ok ? '  ✅ ' : '  ❌ ') + n + (d ? ' — ' + d : ''));
console.log(ko.length ? '\n🔴 ' + ko.length + ' prove fallite su ' + esiti.length : '\n🟢 ' + esiti.length + '/' + esiti.length + ' prove superate');
process.exit(ko.length ? 1 : 0);
