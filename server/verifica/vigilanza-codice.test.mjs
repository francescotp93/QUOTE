// ═══════════════════════════════════════════════════════════════════════════════
//  QUANDO IL PORTALE ASPETTA UN CODICE, IL GUARDIANO SI FERMA
//
//  L'11/09/2026 la casella dell'agenzia si è riempita di codici Groupama.
//  Il meccanismo, che non aveva niente di misterioso una volta guardato:
//
//    1. il rientro automatico chiede allo scraper /login;
//    2. lo scraper rimanda utente e password al portale;
//    3. il portale SPEDISCE UNA MAIL con un codice e aspetta che una persona
//       lo digiti — su Groupama succede sempre, è il suo modo di entrare;
//    4. il guardiano legge «non sono loggato», lo conta come TENTATIVO FALLITO
//       e dopo un quarto d'ora riprova. Daccapo dal punto 2.
//
//  Il rientro automatico su un portale con codice via email non può riuscire
//  MAI da solo: ogni tentativo è una mail in più e un passo verso il blocco
//  dell'utenza in agenzia. Fermarsi ad aspettare il codice non è un fallimento,
//  è un tentativo riuscito a metà che ora vuole una persona.
//
//  Qui si prova quella distinzione, che è una regola: serveIlCodice().
//  Niente portali veri, niente rete: è una funzione pura, apposta per questo.
// ═══════════════════════════════════════════════════════════════════════════════
import { serveIlCodice } from '../fontiWatchdog.js';

const esiti = [];
const prova = (nome, fn) => { try { fn(); esiti.push([true, nome, '']); } catch (e) { esiti.push([false, nome, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

prova('fermo sulla schermata del codice = serve una persona, non un altro tentativo', () => {
  for (const passo of ['attesa_otp', 'attesa_codice']) {
    deve(serveIlCodice(passo) === true,
      'il passo «' + passo + '» non viene riconosciuto: il guardiano lo conta come fallimento e riprova, e ogni tentativo è un codice nuovo nella casella');
  }
});

prova('i passi finiti veri restano fallimenti normali', () => {
  /* Questi NON devono finire nel ramo «serve il codice»: lì il guardiano si
     ferma per mezza giornata, e una fonte davvero caduta resterebbe giù senza
     che nessuno riprovi a rialzarla. La prudenza va nella direzione giusta. */
  for (const passo of ['non_loggato', 'senza_credenziali', 'timeout_otp', 'errore', 'error', 'pronto']) {
    deve(serveIlCodice(passo) === false,
      'il passo «' + passo + '» verrebbe scambiato per un\'attesa di codice: il rientro automatico non riproverebbe più');
  }
});

prova('«loggato» non è mai un\'attesa di codice', () => {
  deve(serveIlCodice('loggato') === false, 'una sessione attiva verrebbe trattata come in attesa di codice');
});

prova('una risposta vuota o storta non si scambia per attesa di codice', () => {
  /* Se lo scraper non risponde, o risponde qualcosa che non capiamo, la cosa
     onesta è «non lo so» → fallimento normale, con i suoi quattro tentativi e
     la sua quarantena. Dire «serve il codice» qui vorrebbe dire zittire il
     rientro automatico per dodici ore sulla base di un vuoto. */
  for (const passo of [undefined, null, '', 'boh', 0, {}, []]) {
    deve(serveIlCodice(passo) === false, 'una risposta ' + JSON.stringify(passo) + ' viene scambiata per attesa di codice');
  }
});

prova('il riconoscimento non è schizzinoso sulle maiuscole', () => {
  deve(serveIlCodice('ATTESA_OTP') === true, 'uno scraper che scrive il passo in maiuscolo non verrebbe riconosciuto');
});

let ko = 0;
console.log('\nVIGILANZA — il portale aspetta un codice');
for (const [ok, n, m] of esiti) { console.log(ok ? '  ok  ' + n : '  X   ' + n + '\n      ' + m); if (!ok) ko++; }
console.log(`\nATTESA CODICE: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
