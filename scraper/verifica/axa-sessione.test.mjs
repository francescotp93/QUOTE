// ═══════════════════════════════════════════════════════════════════════════
//  AXA — una volta dentro, si resta dentro
//
//  PERCHE' ESISTE
//    Francesco, 12/09/2026: «vediamo di non farli sconnettere più, una volta
//    funzionava».
//
//    Su Groupama questo difetto è stato chiuso l'11/09 e il commento diceva
//    «vale per tutti gli scraper, qui si comincia da Groupama». Su AXA era
//    rimasto aperto, e la misura sulla macchina lo ha mostrato: auth.json
//    scritto ad ogni login e RILETTO MAI — e per di più fermo al 2 settembre,
//    dieci giorni prima. Anche rileggendolo avremmo rimesso dentro cookie di
//    dieci giorni: niente. La sessione del portale vive nei cookie di sessione,
//    che Chromium tiene in memoria; ogni riavvio del servizio li perde, e
//    dall'agenzia si legge come «ho fatto l'accesso e mi ha buttato fuori»,
//    con un altro codice AXA Guardian da inserire.
//
//    Sempre quel giorno si è visto un secondo difetto, dal giornale: il codice
//    inserito da una persona («2FA inserito → OK») e poi il silenzio. Il ramo
//    che dichiara il codice non accettato non scriveva niente: impossibile
//    sapere se il codice fosse scaduto — dura 30 secondi — o se il portale
//    avesse rifiutato per altro.
//
//  COSA SI PROVA QUI
//    Che la sessione salvata venga ripresa e tenuta aggiornata, che si salvi
//    prima di spegnersi, che un codice rifiutato lasci una traccia leggibile, e
//    che il segreto TOTP non venga usato quando è un codice a 6 cifre — errore
//    che su Allianz ha rischiato di far bloccare l'utenza dell'agenzia.
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(RADICE, 'axa/quote-service.mjs'), 'utf8');

const esiti = [];
const prova = (nome, fn) => { try { esiti.push([true, nome, fn() || '']); } catch (e) { esiti.push([false, nome, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

prova('la sessione salvata si rilegge, non si scrive soltanto', () => {
  deve(/async function ripristinaSessione/.test(src),
    'auth.json resta scritto e mai riletto: ogni riavvio del servizio butta fuori dal portale');
  deve(/addCookies\(/.test(src),
    'i cookie salvati non vengono rimessi nel browser: senza quelli il portale non ci riconosce');
  return 'ripristinaSessione + addCookies';
});

prova('all\'avvio si prova a rientrare PRIMA di chiedere un codice', () => {
  const da = src.indexOf('// Avvio: se c\'è il segreto TOTP');
  const blocco = da < 0 ? '' : src.slice(da, da + 2200);
  deve(blocco, 'il blocco di avvio non si trova più: questa prova va riscritta, non cancellata');
  const ripristino = blocco.indexOf('ripristinaSessione');
  const arrendersi = blocco.indexOf("setState('pronto'");
  deve(ripristino > -1, 'all\'accensione non si tenta di riprendere la sessione salvata');
  deve(arrendersi > -1, 'non trovo il punto in cui ci si dichiara «pronti al login»: prova da riscrivere');
  deve(ripristino < arrendersi,
    'ci si dichiara «pronti al login» PRIMA di provare la sessione salvata: si chiede un codice che poteva non servire');
  return 'ripristino al carattere ' + ripristino + ', resa al ' + arrendersi;
});

prova('la copia su disco si tiene fresca mentre si lavora', () => {
  /* Il portale rinnova i suoi cookie mentre si usa: una copia presa solo al
     login invecchia, e al riavvio si rientra con qualcosa di morto. È
     esattamente quello che si è misurato: file fermo a dieci giorni prima. */
  const ka = src.slice(src.indexOf('let kaTick'), src.indexOf('}, 5 * 60 * 1000)'));
  deve(ka, 'non trovo più il keep-alive: prova da riscrivere');
  deve(/salvaSessione\(/.test(ka), 'il keep-alive non salva mai la sessione: la copia su disco invecchia e non fa più rientrare');
  /* Si salva solo da dentro. Salvare da sloggati sovrascriverebbe la copia
     buona con una inutile: è il modo perfetto per buttare via l'unica cosa
     rimasta. */
  const ready = ka.slice(ka.indexOf("state === 'ready'"), ka.indexOf("state === 'expired'"));
  deve(/salvaSessione\(/.test(ready), 'la sessione non viene salvata nel ramo in cui risulta viva');
  const expired = ka.slice(ka.indexOf("state === 'expired'"));
  deve(!/salvaSessione\(/.test(expired), 'si salva anche da sloggati: così si cancella la copia buona');
});

prova('prima di spegnersi salva la sessione', () => {
  deve(/process\.on\(segnale/.test(src) && /SIGTERM/.test(src),
    'nessuno spegnimento pulito: ogni rilascio che tocca questa cartella butta fuori dal portale');
  const blocco = src.slice(src.indexOf("for (const segnale of ['SIGTERM'"), src.indexOf("for (const segnale of ['SIGTERM'") + 900);
  deve(/salvaSessione\('spegnimento'\)/.test(blocco), 'allo spegnimento non si salva la sessione');
  deve(/Promise\.race|setTimeout/.test(blocco), 'il salvataggio non ha un tempo massimo: un servizio che non muore è peggio di una sessione persa');
  deve(/viva/.test(blocco), 'si salva anche da sloggati, cancellando la copia buona');
});

prova('«sono dentro» lo dice la home, non l\'indirizzo', () => {
  /* Il 12/09/2026, due volte, il portale si è fermato sulla pagina di rimbalzo
     dell'autenticazione — mobility.axa-italia.it/portal/?code=…&state=… — e il
     pannello ha detto «Login completato ✅» con la sessione inesistente.
     Francesco ha creduto due volte di essere entrato. */
  const i = src.indexOf('const filled = await fillOtpCode(codice)');
  const blocco = src.slice(i, src.indexOf('finally { BUSY = false; }', i));
  deve(blocco, 'non trovo più la conferma del codice: prova da riscrivere');
  deve(!/if \(\(await isLogged\(\)\) \|\| \/\\\/portal\\\/\/i\.test/.test(blocco),
    'si torna a dichiarare l\'accesso riuscito solo perché l\'indirizzo contiene «/portal/»: quell\'indirizzo ce l\'ha anche la pagina di rimbalzo');
  deve(/soloRimbalzo/.test(blocco), 'non si riconosce più la pagina di rimbalzo (code=/state= nell\'indirizzo)');
  /* Il successo deve dipendere da isLogged(), che guarda la home autenticata. */
  const successo = blocco.slice(blocco.indexOf('if (dentro)'), blocco.indexOf('if (dentro)') + 200);
  deve(/if \(dentro\)/.test(successo) && /salvaSessione/.test(successo), 'il ramo di successo non è più legato alla home vera');
  /* E quando resta lì, lo si dice per quello che è: non «codice sbagliato». */
  deve(/non ha aperto la sessione/.test(blocco), 'un accesso fermo sul rimbalzo viene ancora raccontato come codice rifiutato');
  return 'successo solo con la home autenticata';
});

prova('se il portale resta appeso al rimbalzo, si prova ad aprirgli la home', () => {
  const i = src.indexOf('const soloRimbalzo');
  const blocco = src.slice(i, i + 1200);
  deve(/page\.goto\(PORTAL_URL/.test(blocco), 'non si tenta di far concludere il giro aprendo la home');
  deve(/i === \d+/.test(blocco), 'il tentativo non è limitato a una volta sola: rischia di disturbare un login che sta riuscendo');
});

prova('un codice rifiutato lascia scritto perché', () => {
  const i = src.indexOf('codice NON accettato');
  deve(i > -1, 'il ramo «codice non accettato» è di nuovo muto: dal giornale non si capisce cosa sia successo');
  /* Si guarda dalla raccolta degli indizi fino al messaggio: contare i
     caratteri all'indietro rende la prova fragile a ogni riga aggiunta in
     mezzo — è già successo quando è entrato il caso del rimbalzo. */
  const blocco = src.slice(src.indexOf('const dove = (page.url()'), i + 400);
  deve(/page\.url\(\)/.test(blocco), 'non si scrive su quale pagina siamo finiti');
  deve(/role=alert|\.error|alert/i.test(blocco), 'non si legge il messaggio del portale');
  /* Il contenuto dei campi non esce MAI nel giornale: lì dentro c'è il codice
     dell'operatore e, altrove nel flusso, dati del cliente. */
  deve(!/inputValue\(\)/.test(blocco), 'si rischia di scrivere nel giornale il contenuto di un campo');
});

prova('il messaggio dice che il codice dura 30 secondi e come non farselo più chiedere', () => {
  /* lastIndexOf: la prima occorrenza è quella breve dello stato a schermo, la
     seconda è il messaggio che arriva davvero all'operatore. */
  const i = src.lastIndexOf('Codice non accettato');
  const msg = src.slice(i, i + 700);
  deve(/30 secondi/.test(msg), 'non dice che il codice Guardian dura 30 secondi: è la causa più probabile del rifiuto');
  deve(/segreto TOTP|seme/i.test(msg), 'non dice come non farselo più chiedere (salvare il segreto in Fonti)');
});

prova('il seme TOTP non si usa quando è un codice a 6 cifre', () => {
  deve(/function semePlausibile/.test(src),
    'manca la guardia sul seme: con un codice a 6 cifre al posto del seme si mandano passcode sbagliati al portale, fino a farsi bloccare l\'utenza');
  /* La guardia deve stare davanti a ENTRAMBE le vie che usano il seme: il login
     guidato e il rientro automatico del keep-alive. Una sola non basta. */
  const usi = [...src.matchAll(/c\.totpSecret\s*&&\s*!semeKo|c\.totpSecret\)\s*\{/g)].length;
  deve(/const semeKo = motivoSemeNonValido\(c\.totpSecret\)/.test(src), 'il motivo non viene calcolato');
  const login = src.slice(src.indexOf('if (await otpField()) {'), src.indexOf('if (await otpField()) {') + 900);
  deve(/!semeKo/.test(login), 'il login guidato usa il seme senza controllarlo');
  const ka = src.slice(src.indexOf("state === 'expired'"));
  deve(/!semeKo/.test(ka), 'il rientro automatico usa il seme senza controllarlo');
  deve(/tutte cifre/.test(src), 'il motivo non spiega che è stato incollato un codice al posto del seme');
  return usi + ' punti protetti';
});

prova('«manca il seme» si dice una volta, non ogni cinque minuti', () => {
  /* Il 12/09/2026 il giornale ne aveva una riga ogni cinque minuti, tutta la
     notte: trenta righe identiche che dicono la stessa cosa nascondono quelle
     che contano. */
  deve(/avvisatoSeme/.test(src), 'l\'avviso torna a ripetersi ad ogni giro del keep-alive');
  deve(/avvisatoSeme = false/.test(src), 'una volta rientrati, l\'avviso non si riarma: al prossimo distacco resterebbe muto');
});

prova('quando la sessione cade, si scrive quando', () => {
  deve(/è caduta adesso/.test(src),
    'la caduta resta silenziosa: senza quel momento non si può sapere quanto dura una sessione, e quindi nemmeno come tenerla viva');
});

let ko = 0;
for (const [ok, nome, nota] of esiti) { if (!ok) ko++; console.log((ok ? '  ok  ' : '  KO  ') + nome + (nota ? '  — ' + nota : '')); }
console.log('\nAXA SESSIONE: ' + (esiti.length - ko) + ' superate, ' + ko + ' fallite');
process.exit(ko ? 1 : 0);
