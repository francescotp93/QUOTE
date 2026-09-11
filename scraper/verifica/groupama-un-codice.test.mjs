// ═══════════════════════════════════════════════════════════════════════════
//  GROUPAMA — un codice per volta, non una raffica
//
//  PERCHE' ESISTE
//    L'11/09/2026 Francesco: «occhio a Groupama, sta mandando in continuazione
//    codici alla mail». Non era il portale impazzito: eravamo noi.
//
//    Ogni passaggio da doAccedi() rimanda utente e password al portale, e il
//    portale risponde spedendo UNA MAIL con un codice nuovo. Chi chiama non lo
//    sa: per lui e' «prova ad accedere», e riprovare sembra gratis. Il guardiano
//    delle fonti (server/fontiWatchdog.js) riprovava il rientro automatico ogni
//    quarto d'ora — e su Groupama il rientro automatico non puo' riuscire MAI,
//    perche' il codice arriva per posta e lo deve leggere una persona. Quattro
//    tentativi, quattro codici, sei ore di pausa, daccapo. Per sempre.
//
//    La causa vera sta nel guardiano ed e' corretta li' (verifica
//    server/verifica/vigilanza-codice.test.mjs). Questo freno sta nello scraper
//    di proposito: e' l'ultimo punto prima del portale, quindi vale per
//    QUALUNQUE chiamante — compresi quelli che verranno, che non sapranno niente
//    di questa storia. Una casella piena di codici non e' solo fastidio: e' la
//    strada per farsi bloccare l'utenza in agenzia.
//
//  COSA SI PROVA QUI
//    Che il freno c'e', che sta PRIMA dell'invio delle credenziali (dopo non
//    servirebbe a niente: la mail e' gia' partita), e che lascia passare i gesti
//    di una persona, che si contano da soli.
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(RADICE, 'groupama/quote-service.mjs'), 'utf8');

const esiti = [];
const prova = (nome, fn) => { try { const d = fn() || ''; esiti.push([true, nome, d]); } catch (e) { esiti.push([false, nome, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

// Il corpo di doAccedi: dall'intestazione fino alla funzione dopo.
const daAccedi = src.indexOf('async function doAccedi');
const corpoAccedi = daAccedi < 0 ? '' : src.slice(daAccedi, src.indexOf('async function doCodice'));

prova('il freno esiste e ha una durata dichiarata', () => {
  deve(/RAFFICA_CODICE_MS\s*=/.test(src), 'non c\'e\' nessun freno anti-raffica: ogni chiamata a /login e\' un codice nuovo nella casella');
  deve(/let\s+OTP_CHIESTO_IL/.test(src), 'manca la memoria di quando e\' partito l\'ultimo codice: senza, il freno non puo\' sapere se frenare');
  return 'RAFFICA_CODICE_MS + OTP_CHIESTO_IL';
});

prova('il freno sta PRIMA che le credenziali partano', () => {
  deve(corpoAccedi, 'doAccedi non si trova piu\': questa prova va riscritta, non cancellata');
  const freno = corpoAccedi.indexOf('RAFFICA_CODICE_MS');
  const invio = corpoAccedi.indexOf('page.goto(c.loginUrl');
  deve(freno > -1, 'dentro doAccedi non c\'e\' nessun controllo sul codice gia\' spedito');
  deve(invio > -1, 'non trovo piu\' il punto in cui si va sul portale: prova da riscrivere');
  deve(freno < invio, 'il freno arriva DOPO l\'invio delle credenziali: a quel punto la mail col codice e\' gia\' partita e frenare non serve a niente');
  return 'controllo al carattere ' + freno + ', invio al ' + invio;
});

prova('chi preme a mano passa: «forza» scavalca il freno', () => {
  /* Il freno deve fermare i timer, non le persone. Chi preme «Rifai l'accesso»
     sta guardando la casella in quel momento: sa quanti codici ha chiesto. */
  deve(/!opz\.forza\s*&&/.test(corpoAccedi) || /opz\.forza\s*\?/.test(corpoAccedi),
    'il freno vale anche per l\'accesso forzato: chi ha cambiato la password sul portale non riuscirebbe piu\' a verificarla');
  return '?forza=1 resta libero';
});

prova('l\'ora del codice si segna quando il portale lo ha davvero spedito', () => {
  /* Segnarla prima (all'inizio di doAccedi) bloccherebbe il tentativo successivo
     anche quando nessuna mail e' partita — per esempio se le credenziali sono
     sbagliate e non si arriva mai alla schermata del codice. */
  const riga = src.split('\n').find(r => r.includes('OTP_CHIESTO_IL = Date.now()') && r.includes('HOLD = true'));
  deve(riga, 'l\'ora dell\'ultimo codice non viene segnata quando si raggiunge la schermata OTP: il freno non frenerebbe mai');
  return 'segnata sulla schermata OTP';
});

prova('quando si e\' dentro, il freno si toglie da solo', () => {
  /* Se restasse acceso, il primo rientro legittimo dopo una sessione scaduta
     verrebbe rifiutato con «un codice e' gia' stato inviato» — e non sarebbe
     vero. Si azzera in setState, in un punto solo, cosi' non se ne dimentica
     nessuno dei quattro rami che dichiarano «loggato». */
  const setState = src.split('\n').find(r => r.startsWith('const setState'));
  deve(setState, 'setState non si trova piu\': prova da riscrivere');
  deve(setState.includes('OTP_CHIESTO_IL = 0'),
    'entrando non si azzera il codice in volo: dopo un accesso riuscito il freno resterebbe acceso a vuoto');
  return 'azzerato in setState';
});

prova('«Invia altro codice» fa ripartire il conteggio', () => {
  const da = src.indexOf('async function doResend');
  const corpo = da < 0 ? '' : src.slice(da, da + 2600);
  deve(corpo, 'doResend non si trova piu\': prova da riscrivere');
  deve(corpo.includes('OTP_CHIESTO_IL = Date.now()'),
    'un codice chiesto a mano non aggiorna l\'ora: il freno crederebbe ancora valido quello di prima');
  return 'il nuovo codice riparte da adesso';
});

const ko = esiti.filter(e => !e[0]);
console.log('\n── Groupama · un codice per volta ──────────────────────────');
for (const [ok, n, d] of esiti) console.log((ok ? '  ✅ ' : '  ❌ ') + n + (d ? ' — ' + d : ''));
console.log(ko.length ? '\n🔴 ' + ko.length + ' prove fallite su ' + esiti.length : '\n🟢 ' + esiti.length + '/' + esiti.length + ' prove superate');
process.exit(ko.length ? 1 : 0);
