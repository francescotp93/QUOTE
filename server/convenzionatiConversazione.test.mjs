// ═══════════════════════════════════════════════════════════════════════════════
//  LA CONVERSAZIONE SU UNA RICHIESTA, LATO CLIENTE
//
//  PERCHE' ESISTE
//    Nel pannello si scrive «nota interna» oppure «visibile a chi ha chiesto».
//    Questa e' la seconda meta': dove quel «visibile» si vede davvero, e dove
//    lui puo' rispondere e mandarci un file.
//
//    E' la parte in cui si sbaglia piu' facilmente, perche' tre cose che
//    sembrano dettagli non lo sono:
//      · il filtro fra interno e no deve stare SUL SERVER. Una pagina che
//        riceve tutto e nasconde le note interne le ha comunque ricevute:
//        bastano gli strumenti del browser per leggerle;
//      · il deposito degli allegati non e' suo. Non deve poterci scrivere: i
//        file passano dal server, che controlla che la richiesta sia la sua;
//      · «non esiste» e «non e' tua» devono essere la STESSA risposta, o la
//        differenza dice a un estraneo quali pratiche esistono.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const senzaCommenti = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
const src = senzaCommenti(fs.readFileSync(path.join(QUI, 'convenzionati.js'), 'utf8'));
const pezzo = (da, a) => src.slice(src.indexOf(da), a ? src.indexOf(a) : undefined);
const mia    = pezzo('async function miaRichiesta', "convenzionatiRouter_pubblicoAssociati.post('/mia-richiesta'");
const legge  = pezzo("convenzionatiRouter_pubblicoAssociati.post('/mia-richiesta'", "convenzionatiRouter_pubblicoAssociati.post('/mio-messaggio'");
const scrive = pezzo("convenzionatiRouter_pubblicoAssociati.post('/mio-messaggio'", "convenzionatiRouter_pubblicoAssociati.post('/mio-allegato'");
const carica = pezzo("convenzionatiRouter_pubblicoAssociati.post('/mio-allegato'", "convenzionatiRouter_pubblicoAssociati.post('/mio-allegato-link'");
const link   = pezzo("convenzionatiRouter_pubblicoAssociati.post('/mio-allegato-link'", 'export function emailRispostaCliente');

const esiti = [];
const prova = (n, f) => { try { esiti.push([true, n, f() || '']); } catch (e) { esiti.push([false, n, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

prova('una richiesta di un altro non si apre', () => {
  deve(/associato_id=eq\.\$\{encodeURIComponent\(assoc\.id\)\}/.test(mia),
    'cerca la richiesta per identificativo e basta: con un id qualunque si apre quella di chiunque');
  return 'si cerca la sua, non quella con quel numero';
});

prova('«non esiste» e «non e\' tua» sono la stessa risposta', () => {
  /* La differenza fra le due direbbe a un estraneo se un certo numero di
     pratica esiste: si prova finche' il messaggio cambia. */
  const quanti = (mia.match(/e\.stato = 404/g) || []).length;
  deve(quanti === 1, 'ci sono ' + quanti + ' risposte diverse invece di una');
  deve(/Non troviamo questa richiesta/.test(mia), 'la risposta dice piu\' di quello che deve');
  return 'una risposta sola per tutti e due i casi';
});

prova('le note interne non partono proprio', () => {
  /* Non «partono e la pagina le nasconde»: quello che non deve vedere non deve
     nemmeno arrivargli, o basta aprire gli strumenti del browser. */
  deve(/interno=eq\.false/.test(legge), 'manda tutto e si fida della pagina');
  const dopo = legge.slice(legge.indexOf('const dove'));
  deve(/quote_richiesta_messaggi\?\$\{dove\}/.test(dopo) && /quote_richiesta_allegati\?\$\{dove\}/.test(dopo),
    'il filtro vale per i messaggi ma non per gli allegati, o viceversa');
  return 'quello che non deve vedere non parte';
});

prova('quello che scrive lui non e\' mai interno', () => {
  // «Interno» vuol dire «fra noi», e questo arriva da fuori.
  deve(/interno: false, da_cliente: true/.test(scrive), 'un messaggio del cliente puo\' finire fra le note interne');
  deve(/quote_richiesta_messaggi/.test(scrive), 'non lo salva da nessuna parte');
  return 'da fuori, e si vede che viene da fuori';
});

prova('se risponde, lo sappiamo', () => {
  /* Senza avviso la sua risposta resta in una schermata che nessuno apre
     finche' non ci pensa. */
  deve(/inviaEmail\(STAFF_INBOX/.test(scrive), 'la sua risposta non avvisa nessuno');
  const i = scrive.indexOf('quote_richiesta_messaggi');
  const j = scrive.indexOf('inviaEmail(STAFF_INBOX');
  deve(i > -1 && j > i, 'avvisa prima di salvare');
  deve(/catch \(err\) \{ console\.warn\('\[convenzionati\] avviso risposta non partito/.test(scrive),
    'un\'email che non parte fa perdere il messaggio');
  return 'prima si salva, poi si avvisa';
});

prova('il nome del file non decide dove si scrive', () => {
  /* Un nome con barre e punti, montato in un percorso, porta a scrivere da
     tutt'altra parte. Qui non ci arriva: non lo usiamo. */
  deve(/const percorso = 'convenzione\/' \+ rich\.id \+ '\/' \+ Date\.now\(\)/.test(carica),
    'il percorso nel deposito e\' costruito col nome scelto da chi carica');
  deve(/nome\.match\(\/\\\.\[A-Za-z0-9\]\{1,8\}\$\/\)/.test(carica), 'prende l\'estensione senza limitarla');
  return 'il percorso lo decidiamo noi';
});

prova('un file troppo grande si rifiuta prima di depositarlo', () => {
  deve(/MAX_ALLEGATO_CLIENTE/.test(carica), 'accetta un file di qualunque peso');
  const i = carica.indexOf('MAX_ALLEGATO_CLIENTE');
  const j = carica.indexOf('storage/v1/object/richieste');
  deve(i > -1 && j > i, 'lo deposita e poi controlla quanto pesa');
  deve(/10 MB/.test(carica), 'non dice qual e\' il limite: si riprova a caso');
  return 'si guarda prima, e si dice quanto';
});

prova('lui non scrive nel deposito: ci scrive il server', () => {
  /* Il deposito non e' suo e non deve esserlo. Se potesse scriverci, potrebbe
     scrivere anche dove non c'entra niente. */
  deve(/srvKey\(\)/.test(carica), 'il file verrebbe depositato con le sue credenziali');
  deve(/da_cliente: true/.test(carica), 'non resta scritto che l\'ha mandato lui');
  return 'passa da noi, e lo deposita la nostra chiave';
});

prova('l\'indirizzo di un allegato non si ottiene provando numeri', () => {
  deve(/await miaRichiesta\(assoc, a\.riferimento\)/.test(link),
    'basta un identificativo di allegato per farsi dare il file di un altro');
  deve(/interno=eq\.false/.test(link), 'si puo\' chiedere l\'indirizzo di un allegato interno');
  deve(/expiresIn: 3600/.test(link), 'l\'indirizzo vale per sempre');
  return 'e\' suo, non e\' interno, e vale un\'ora';
});

const ko = esiti.filter(e => !e[0]);
console.log('\n── La conversazione lato cliente ───────────────────────────');
for (const [ok, n, d] of esiti) console.log((ok ? '  ✅ ' : '  ❌ ') + n + (d ? ' — ' + d : ''));
console.log(ko.length ? '\n🔴 ' + ko.length + ' prove fallite su ' + esiti.length : '\n🟢 ' + esiti.length + '/' + esiti.length + ' prove superate');
process.exit(ko.length ? 1 : 0);
