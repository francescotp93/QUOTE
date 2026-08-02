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

// ── 3. Nessuno scraper confronta più per prefisso ────────────────────────────
for (const c of COMPAGNIE) {
  const src = fs.readFileSync(path.join(qui, '..', c, 'quote-service.mjs'), 'utf8');

  prova(c + ': non resta nessun confronto per prefisso', () => {
    const n = (src.match(/pathname\.startsWith\(/g) || []).length;
    deve(n === 0, 'ci sono ancora ' + n + ' confronti per prefisso: le rotte si rimangiano tra loro');
  });

  prova(c + ': tutte le rotte passano da rottaE', () => {
    const n = (src.match(/rottaE\(/g) || []).length;
    deve(n >= 4, 'solo ' + n + ' rotte usano il confronto esatto');
    deve(/import \{ rottaE \} from '\.\.\/comune\/rotte\.mjs'/.test(src), 'manca l\'import');
    return n + ' rotte';
  });
}

// ── 4. Il freno non ha più scorciatoie ───────────────────────────────────────
for (const c of ['allianz', 'italiana']) {
  prova(c + ': il freno si toglie solo dalla rotta /login esatta', () => {
    const src = fs.readFileSync(path.join(qui, '..', c, 'quote-service.mjs'), 'utf8');
    const i = src.indexOf('FRENO.sblocca()');
    deve(i > 0, 'lo sblocco del freno è sparito');
    const attorno = src.slice(Math.max(0, i - 400), i);
    deve(/rottaE\(u, '\/login'\)/.test(attorno),
      'lo sblocco non è agganciato al confronto esatto su /login: una rotta che comincia per /login potrebbe rimuoverlo');
    /* La rotta che veniva mangiata deve esistere ancora ed essere dichiarata a
       parte: se sparisse, questa prova diventerebbe verde senza dimostrare
       niente. */
    const nomi = [...src.matchAll(/rottaE\(u, '([^']+)'\)/g)].map(m => m[1]);
    deve(nomi.includes('/logindump'), '/logindump non è più dichiarata: era proprio la rotta mangiata');
    deve(collisioniDiPrefisso(nomi).length > 0,
      'nell\'elenco non ci sono più prefissi che si sovrappongono: questa prova non sorveglia più niente');
    return nomi.length + ' rotte, ' + collisioniDiPrefisso(nomi).length + ' si sovrapporrebbero per prefisso';
  });
}

let ko = 0;
console.log('\nROTTE — una rotta si riconosce per il nome intero');
for (const [ok, nome, msg] of esiti) {
  console.log(ok ? '  ok  ' + nome + (msg ? ' — ' + msg : '') : '  X   ' + nome + ' — ' + msg);
  if (!ok) ko++;
}
console.log(`\nROTTE: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
