// ═══════════════════════════════════════════════════════════════════════════
//  GROUPAMA — una volta dentro, si resta dentro
//
//  PERCHE' ESISTE
//    Francesco, 11/09/2026: «una volta fatto l'accesso non mi deve buttare più
//    fuori, a meno che non venga cambiata la password o l'utenza».
//
//    Perche' invece buttava fuori: la sessione del portale vive nei COOKIE DI
//    SESSIONE, quelli senza data di scadenza. Chromium li tiene in MEMORIA e non
//    li scrive nel profilo su disco. Bastava quindi che il servizio si
//    riavviasse — e si riavvia a OGNI rilascio che tocca la sua cartella, piu'
//    ogni volta che il browser va in crisi — perche' quei cookie sparissero e il
//    portale ci vedesse come sconosciuti. Risultato visto dall'agenzia: accesso
//    fatto la mattina, buttato fuori nel pomeriggio, e un altro codice da
//    cercare nella posta.
//
//    Il pezzo che mancava non era grande: auth.json veniva SCRITTO ad ogni login
//    riuscito e non veniva RILETTO MAI. Una rete di sicurezza stesa e mai
//    agganciata — e invisibile, perche' il file c'era e sembrava che servisse.
//
//  COSA SI PROVA QUI
//    Che la sessione salvata venga ripresa, che venga ripresa PRIMA di arrendersi
//    e far ripartire la trafila del codice, e che la copia buona su disco non
//    venga sovrascritta proprio quando e' l'unica cosa che ci fa rientrare.
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(RADICE, 'groupama/quote-service.mjs'), 'utf8');

const esiti = [];
const prova = (nome, fn) => { try { const d = fn() || ''; esiti.push([true, nome, d]); } catch (e) { esiti.push([false, nome, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

prova('la sessione salvata si rilegge, non si scrive soltanto', () => {
  deve(/async function ripristinaSessione/.test(src),
    'auth.json torna a essere scritto e mai riletto: ogni riavvio del servizio butta fuori dal portale');
  deve(/addCookies\(/.test(src),
    'i cookie salvati non vengono rimessi nel browser: senza quelli il portale non ci riconosce');
  return 'ripristinaSessione + addCookies';
});

prova('all\'avvio si prova a rientrare PRIMA di chiedere un codice', () => {
  const da = src.indexOf('// Avvio: NON invio le credenziali');
  const blocco = da < 0 ? '' : src.slice(da, da + 1800);
  deve(blocco, 'il blocco di avvio non si trova piu\': questa prova va riscritta, non cancellata');
  const ripristino = blocco.indexOf('ripristinaSessione');
  const arrendersi = blocco.indexOf("step: 'pronto'");
  deve(ripristino > -1, 'all\'accensione non si tenta piu\' di riprendere la sessione salvata');
  deve(arrendersi > -1, 'non trovo piu\' il punto in cui ci si dichiara «pronti al login»: prova da riscrivere');
  deve(ripristino < arrendersi,
    'ci si dichiara «pronti al login» PRIMA di provare la sessione salvata: si chiede un codice che poteva non servire');
  return 'ripristino al carattere ' + ripristino + ', resa al ' + arrendersi;
});

prova('anche un browser rilanciato si riprende la sessione', () => {
  /* ensurePage rilancia l'intero browser quando la pagina e' morta. Browser
     nuovo = cookie di sessione persi, esattamente come dopo un riavvio: se qui
     non si ripristina, una crisi del browser costa un codice via email. */
  const da = src.indexOf('[recovery] contesto morto');
  const blocco = da < 0 ? '' : src.slice(da, da + 700);
  deve(blocco, 'il ramo di recupero del browser non si trova piu\': prova da riscrivere');
  deve(blocco.includes('ripristinaSessione'),
    'dopo aver rilanciato il browser non si rimette la sessione: si riparte da sconosciuti');
  return 'ripristino anche dopo il rilancio';
});

prova('prima di spegnersi il servizio salva la sessione', () => {
  /* E' il pezzo che rende indolori i rilasci: systemd manda SIGTERM, e fino a
     ieri si moriva li' coi cookie solo in memoria. */
  deve(/SIGTERM/.test(src), 'nessuno raccoglie il segnale di spegnimento: ad ogni rilascio la sessione muore in memoria');
  const da = src.indexOf("for (const segnale of ['SIGTERM'");
  const blocco = da < 0 ? '' : src.slice(da, da + 1400);
  deve(blocco.includes('salvaSessione'), 'allo spegnimento non si salva niente: il riavvio successivo riparte da zero');
  return 'sessione salvata allo spegnimento';
});

prova('da sloggati NON si sovrascrive la copia buona', () => {
  /* Se in quel momento siamo fuori, la copia su disco vale piu' di quella in
     memoria: e' quella che ci fara' rientrare. Salvarci sopra uno stato da
     sloggati sarebbe il modo perfetto per buttare via l'unica cosa utile. */
  const da = src.indexOf("for (const segnale of ['SIGTERM'");
  const blocco = da < 0 ? '' : src.slice(da, da + 1400);
  deve(/const viva =/.test(blocco) && /if \(viva\)/.test(blocco),
    'allo spegnimento si salva senza guardare se la sessione e\' viva: una copia da sloggati cancella quella buona');
  /* Il keep-alive si prende INTERO, dalla sua prima riga alla sua chiusura, non
     a misura di caratteri: contarli rende la prova fragile a qualunque commento
     aggiunto dentro il blocco — è successo il 12/09/2026, con la prova diventata
     rossa su codice che si comportava esattamente come prima. Quello che si
     verifica non cambia di una virgola. */
  const ka = src.indexOf('let kaTick = 0;');
  const fine = src.indexOf('}, 4 * 60 * 1000)', ka);
  const keepalive = (ka < 0 || fine < 0) ? '' : src.slice(ka, fine);
  deve(keepalive, 'non trovo più il keep-alive: prova da riscrivere, non da cancellare');
  deve(/else if \(kaTick % \d+ === 0\) await salvaSessione/.test(keepalive),
    'il salvataggio periodico non e\' legato al ramo «la password NON compare»: si rischia di salvare una sessione gia\' caduta');
  return 'si salva solo quando c\'è qualcosa di buono da salvare';
});

const ko = esiti.filter(e => !e[0]);
console.log('\n── Groupama · una volta dentro, si resta dentro ────────────');
for (const [ok, n, d] of esiti) console.log((ok ? '  ✅ ' : '  ❌ ') + n + (d ? ' — ' + d : ''));
console.log(ko.length ? '\n🔴 ' + ko.length + ' prove fallite su ' + esiti.length : '\n🟢 ' + esiti.length + '/' + esiti.length + ' prove superate');
process.exit(ko.length ? 1 : 0);
