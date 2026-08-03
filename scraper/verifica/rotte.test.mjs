// ═══════════════════════════════════════════════════════════════════════════════
//  LE ROTTE — una rotta si riconosce per il nome intero
//
//  Il difetto (trovato il 02/08/2026, presente da sempre): i tre scraper
//  smistavano le richieste con `u.pathname.startsWith('/nome')`. Siccome
//  '/logindump'.startsWith('/login') è vero e `/login` era dichiarata prima,
//  `/logindump` non è mai stata raggiungibile: chiamarla eseguiva un login.
//
//  Dal 01/08/2026 la conseguenza era peggiore. `/login` toglie il freno sui
//  tentativi di accesso, perché è il gesto di una persona che ha appena messo
//  un codice nuovo. Con la collisione bastava chiamare una rotta di
//  DIAGNOSTICA per rimettere in moto il ciclo di login che il freno fermava:
//  il freno aveva una scorciatoia, e la prova che lo sorvegliava non la vedeva
//  perché guardava solo dove comparisse `sblocca()`.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { rottaE, collisioniDiPrefisso } from '../comune/rotte.mjs';

const qui = path.dirname(fileURLToPath(import.meta.url));
const COMPAGNIE = ['allianz', 'italiana', 'moto'];

const esiti = [];
const prova = (nome, fn) => {
  try { const m = fn(); esiti.push([true, nome, m || '']); }
  catch (e) { esiti.push([false, nome, e.message]); }
};
const deve = (c, msg) => { if (!c) throw new Error(msg); };

const url = (p) => new URL(p, 'http://x');

// ── 1. Il confronto ──────────────────────────────────────────────────────────
prova('una rotta risponde al proprio nome', () => {
  deve(rottaE(url('/login'), '/login'), '/login non riconosce se stessa');
  deve(rottaE(url('/status'), '/status'), '/status non riconosce se stessa');
});

prova('una rotta NON risponde al nome di un\'altra che le somiglia', () => {
  /* Il cuore della correzione. */
  deve(!rottaE(url('/logindump'), '/login'), '/logindump viene ancora presa per /login');
  deve(!rottaE(url('/loginqualsiasi'), '/login'), 'basta aggiungere lettere per entrare da /login');
  deve(!rottaE(url('/statuszzz'), '/status'), 'stesso difetto su /status');
});

prova('la riga di ricerca non conta', () => {
  deve(rottaE(url('/lookup?targa=AB123CD'), '/lookup'), 'con ?targa= la rotta non si riconosce più');
  deve(rottaE(url('/auto?targa=AB123CD&situazione=Rinnovo'), '/auto'), 'due parametri e la rotta si perde');
  deve(!rottaE(url('/lookupx?targa=AB123CD'), '/lookup'), 'la riga di ricerca fa rientrare il difetto');
});

prova('la barra finale si perdona', () => {
  deve(rottaE(url('/status/'), '/status'), 'una barra in fondo e la rotta non risponde');
});

prova('accetta anche una stringa, non solo un URL', () => {
  deve(rottaE('/login', '/login'), 'con una stringa non funziona');
  deve(!rottaE('/logindump', '/login'), 'con una stringa il difetto torna');
  deve(rottaE('/lookup?targa=X', '/lookup'), 'con una stringa la riga di ricerca rompe tutto');
});

prova('niente in ingresso non è mai una rotta', () => {
  deve(!rottaE(null, '/login') && !rottaE(undefined, '/login'), 'con niente in ingresso risponde sì');
});

// ── 2. Il difetto esisteva davvero ───────────────────────────────────────────
prova('l\'elenco vero delle rotte contiene una collisione di prefisso', () => {
  /* Se un giorno questa prova diventasse verde a vuoto perché qualcuno ha
     rinominato /logindump, va bene: ma finché si chiama così, deve dimostrare
     PERCHÉ il confronto per prefisso era sbagliato. */
  const c = collisioniDiPrefisso(['/status', '/login', '/logindump', '/otpdump', '/lookup', '/shot']);
  const trovata = c.some(([a, b]) => a === '/login' && b === '/logindump');
  deve(trovata, 'la collisione /login → /logindump non viene più rilevata');
  return c.length + ' collisioni nell\'elenco reale';
});

/* ── Sugli scraper veri non si prova più qui ─────────────────────────────────
   Qui c'erano altre due sezioni che pretendevano un rifacimento: zero
   `pathname.startsWith(` e ogni rotta passata da `rottaE`. Erano state scritte
   contro copie corte degli scraper, non contro quelli che girano davvero: il
   codice di produzione risolve la stessa cosa alla maniera di casa, con una
   guardia negativa esplicita (`… .startsWith('/login') && !… .startsWith('/logindump')`).

   Preteso il MEZZO invece del FINE, quelle prove restavano rosse su un codice
   corretto — cioè non dicevano più niente di vero. Il fine è sorvegliato, sul
   codice vivo, da `rotte-vive.test.mjs`: ogni rotta dichiarata dev'essere
   raggiungibile, e chiedere una diagnostica non deve togliere il freno.
   Quello che resta in questo file prova il modulo `rotte.mjs` in sé. ─────── */

let ko = 0;
console.log('\nROTTE — una rotta si riconosce per il nome intero');
for (const [ok, nome, msg] of esiti) {
  console.log(ok ? '  ok  ' + nome + (msg ? ' — ' + msg : '') : '  X   ' + nome + ' — ' + msg);
  if (!ok) ko++;
}
console.log(`\nROTTE: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
