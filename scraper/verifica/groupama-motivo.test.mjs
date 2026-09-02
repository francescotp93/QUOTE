// ═══════════════════════════════════════════════════════════════════════════
//  GROUPAMA — «controlla utente/password» non e' una spiegazione
//
//  PERCHE' ESISTE
//    Il 2 settembre 2026 Francesco: «groupama non accede di nuovo anche se le
//    credenziali sono a posto». Aveva ragione lui. L'ultima riga di doAccedi()
//    diceva sempre «Login non riuscito: controlla utente/password», e ci si
//    arrivava da TRE strade diverse — fra cui quella in cui il portale ci ha
//    fatto entrare benissimo ed e' ISA a non aprirsi. In quel caso mandare a
//    cambiare la password e' il consiglio peggiore possibile: si tocca una
//    cosa che funziona per riparare una che non dipende da noi.
//
//    Stessa lezione di Allianz, altra compagnia: un messaggio che manda dalla
//    parte sbagliata costa piu' di nessun messaggio.
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(RADICE, 'groupama/quote-service.mjs'), 'utf8');

const da = src.indexOf('function motivoNonLoggato');
const pezzo = da < 0 ? '' : src.slice(da, src.indexOf('// SCHERMATA 1 → 2'));
const motivoNonLoggato = da < 0
  ? () => { throw new Error('motivoNonLoggato non esiste: una frase sola copre ancora tre situazioni diverse'); }
  : new Function(pezzo + '\nreturn motivoNonLoggato;')();

const esiti = [];
const prova = (n, f) => { try { esiti.push([true, n, f() || '']); } catch (e) { esiti.push([false, n, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

prova('se e\' ISA a non aprirsi, NON manda a cambiare le credenziali', () => {
  // E' il caso di Francesco: guscio dentro, ISA fuori.
  const m = motivoNonLoggato({ guscio: true, isa: false, passwordInPagina: false, testo: '' });
  deve(/vanno bene/i.test(m), 'non dice che utente e password sono a posto: ' + m);
  deve(/ISA/.test(m), 'non nomina la parte che davvero non si apre: ' + m);
  deve(!/aggiorna.*Fonti|cambia.*password/i.test(m), 'manda comunque a toccare le credenziali: ' + m);
  return 'la colpa finisce dove sta davvero';
});

prova('una password scaduta si chiama col suo nome', () => {
  const m = motivoNonLoggato({ guscio: false, isa: null, passwordInPagina: true, testo: 'La password è scaduta, cambiala' });
  deve(/SCADUTA/.test(m), 'non riconosce la password scaduta: ' + m);
  deve(/aggiorna|Fonti/i.test(m), 'non dice che poi va aggiornata anche qui: ' + m);
  return 'due gesti, e li dice tutti e due';
});

prova('un\'utenza bloccata non si ripara cambiando password', () => {
  const m = motivoNonLoggato({ guscio: false, isa: null, passwordInPagina: true, testo: 'Utenza bloccata per troppi tentativi' });
  deve(/BLOCCATA/.test(m), 'non riconosce il blocco: ' + m);
  deve(/assistenza|sbloccat/i.test(m), 'non indica chi puo\' sbloccarla: ' + m);
  deve(/non serve/i.test(m), 'lascia credere che cambiare la password basti: ' + m);
  return 'il rimedio giusto, non quello a portata di mano';
});

prova('un rifiuto vero manda davvero alle credenziali', () => {
  // La frase di prima non era sbagliata sempre: era sbagliata quando non c'entrava.
  const m = motivoNonLoggato({ guscio: false, isa: null, passwordInPagina: true, testo: 'Credenziali non valide' });
  deve(/rifiutato/i.test(m), 'non dice che il portale ha detto di no: ' + m);
  deve(/Fonti/.test(m), 'non dice dove si aggiornano: ' + m);
  return 'dov\'e\' giusto, il consiglio resta';
});

prova('se la password non e\' mai stata chiesta, non e\' colpa della password', () => {
  const m = motivoNonLoggato({ guscio: false, isa: null, passwordInPagina: false, testo: 'Servizio momentaneamente non disponibile' });
  deve(/nessuna credenziale/i.test(m), 'non dice che non e\' stato provato niente: ' + m);
  deve(/manutenzione|lento/i.test(m), 'non offre la spiegazione plausibile: ' + m);
  return 'non si accusa chi non e\' nemmeno entrato in scena';
});

prova('quando non si sa, si dice che non si sa', () => {
  const m = motivoNonLoggato({ guscio: false, isa: null, passwordInPagina: true, testo: 'pagina qualunque' });
  deve(/non dice perche|non dice perché/i.test(m), 'inventa una causa: ' + m);
  deve(/riprova/i.test(m), 'non suggerisce la cosa piu\' economica da fare: ' + m);
  deve(/Prima di toccare la password/i.test(m), 'non trattiene dal gesto piu\' rischioso: ' + m);
  return 'l\'onesta\' e\' una risposta';
});

prova('se il link salvato e\' quello di ISA, lo dice', () => {
  /* Il 2 settembre in «LINK DI ACCESSO» c'era .../PR_ISA/#/home: l'indirizzo dei
     preventivi, non quello per entrare. E' il link che si usa tutti i giorni,
     quindi e' naturale incollare quello — e il login moriva li' incolpando le
     credenziali. */
  const m = motivoNonLoggato({ guscio: false, isa: null, passwordInPagina: false, testo: '', nessunaSchermata: true, linkPersonalizzato: true });
  deve(/LINK DI ACCESSO/.test(m), 'non manda a guardare il campo giusto del pannello: ' + m);
  deve(/PR_ISA/.test(m), 'non dice come si riconosce il link sbagliato: ' + m);
  deve(!/credenziali|password/i.test(m.replace(/casella della password/g, '')), 'tira ancora in ballo le credenziali: ' + m);
  return 'indica il campo da correggere, non quello da non toccare';
});

prova('non si arrende dopo quattro secondi', () => {
  /* Aspettava 2,5s + 1,2s e poi guardava UNA volta. Il portale si costruisce da
     solo nel browser e passa da un gateway: in quattro secondi puo' non aver
     ancora disegnato niente. */
  const f = src.slice(src.indexOf('async function attendiSchermata'), src.indexOf('// SCHERMATA 1 → 2'));
  deve(f, 'non c\'e\' nessuna attesa vera: si guarda una volta e si conclude');
  deve(/hasPasswordField/.test(f) && /otpField/.test(f) && /loggedMarker/.test(f), 'non aspetta tutte e tre le schermate possibili');
  const corpo = src.slice(src.indexOf('async function doAccedi'), src.indexOf('// SCHERMATA 2 → CONFERMA'));
  deve(!/waitForTimeout\(2500\)/.test(corpo), 'l\'attesa a tempo fisso e\' ancora li\'');
  deve(/attendiSchermata\(/.test(corpo), 'doAccedi non usa l\'attesa vera');
  return 'aspetta finche\' la pagina non dice qualcosa';
});

prova('se il link salvato non porta da nessuna parte, prova quello vero', () => {
  const corpo = src.slice(src.indexOf('async function doAccedi'), src.indexOf('// SCHERMATA 2 → CONFERMA'));
  deve(/c\.loginUrl !== DEFAULT_LOGIN/.test(corpo), 'non si accorge che il link salvato e\' diverso da quello di accesso');
  deve(/goto\(DEFAULT_LOGIN/.test(corpo), 'non prova la pagina di login vera prima di arrendersi');
  return 'un link incollato male non rende piu\' impossibile entrare';
});

prova('anche il PALLINO del pannello aspetta davvero', () => {
  /* Lo stesso difetto di doAccedi viveva in loggedIn(), ed e' quello che il
     pannello mostrava: tre secondi fissi, poi un'occhiata sola. Se la pagina non
     si era ancora disegnata, la risposta era «NON sei dentro» su una sessione
     perfettamente viva — Groupama segnata giu' col portale aperto. */
  const f = src.slice(src.indexOf('async function loggedIn'), src.indexOf('// Compila utente+password'));
  deve(f, 'non trovo loggedIn');
  deve(!/waitForTimeout\(3000\)/.test(f), 'l\'attesa a tempo fisso e\' ancora li\'');
  deve(/attendiSchermata\(/.test(f), 'non usa l\'attesa vera');
  deve(/c\.loginUrl !== DEFAULT_LOGIN/.test(f) && /goto\(DEFAULT_LOGIN/.test(f),
    'col link di ISA salvato in Fonti dichiara «fuori» senza aver mai visto una schermata di accesso');
  return 'il pallino racconta la sessione vera, non la lentezza della pagina';
});

prova('doAccedi legge la pagina prima di arrendersi', () => {
  const f = src.slice(src.indexOf('async function doAccedi'), src.indexOf('// SCHERMATA 2 → CONFERMA'));
  deve(!/Login non riuscito: controlla utente\/password/.test(f), 'la frase buona per tutte le stagioni e\' ancora li\'');
  deve(/motivoNonLoggato\(/.test(f), 'non chiede il motivo a chi lo sa calcolare');
  deve(/document\.body \? document\.body\.innerText/.test(f), 'non legge quello che il portale ha scritto in pagina');
  return 'il portale viene ascoltato, non indovinato';
});

const ko = esiti.filter(e => !e[0]);
console.log('\n── Groupama · perche\' il login non e\' andato ────────────────');
for (const [ok, n, d] of esiti) console.log((ok ? '  ✅ ' : '  ❌ ') + n + (d ? ' — ' + d : ''));
console.log(ko.length ? '\n🔴 ' + ko.length + ' prove fallite su ' + esiti.length : '\n🟢 ' + esiti.length + '/' + esiti.length + ' prove superate');
process.exit(ko.length ? 1 : 0);
