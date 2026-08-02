// ═══════════════════════════════════════════════════════════════════════════════
//  NESSUNA ROTTA DEVE ESSERE IRRAGGIUNGIBILE
//
//  Gli scraper smistano le richieste con una catena di
//  `if (u.pathname.startsWith('/nome'))`. Con startsWith una rotta che è
//  prefisso di un'altra se la mangia, e vince quella scritta prima:
//
//      '/logindump'.startsWith('/login')  →  true
//
//  In allianz e italiana `/login` era dichiarata prima di `/logindump`: la
//  rotta che serve a fotografare la pagina di login quando il portale cambia
//  eseguiva invece un tentativo di accesso. Non se n'era accorto nessuno
//  perché una risposta arrivava lo stesso, solo che era di un'altra rotta.
//
//  Dal 02/08/2026 il danno sarebbe stato peggiore: `/login` toglie il freno
//  sui tentativi di accesso, quindi chiedere una DIAGNOSTICA avrebbe rimesso
//  in moto il ciclo di login che il freno era appena stato messo a fermare.
//
//  La correzione è quella già usata da chi ha scritto axa (riga 992): si
//  esclude esplicitamente la rotta più lunga. Non cambia niente per tutte le
//  altre, che continuano a funzionare per prefisso come prima — scelta voluta,
//  perché alcune (es. /sniff, /hub) sono chiamate con sotto-percorsi e
//  convertirle al confronto esatto le romperebbe.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const qui = path.dirname(fileURLToPath(import.meta.url));
const TUTTI = ['allianz', 'assieasy', 'axa', 'groupama', 'hdi', 'italiana', 'kube', 'moto', 'prima', 'quotiamo'];

const esiti = [];
const prova = (nome, fn) => {
  try { const m = fn(); esiti.push([true, nome, m || '']); }
  catch (e) { esiti.push([false, nome, e.message]); }
};
const deve = (c, msg) => { if (!c) throw new Error(msg); };

/**
 * Le rotte di uno scraper, nell'ordine in cui vengono provate, con le
 * esclusioni esplicite che le accompagnano.
 * Restituisce [{ nome, esclude: [...] }] nell'ordine di dichiarazione.
 */
function rotteDi(src) {
  const fuori = [];
  const re = /u\.pathname\.startsWith\('([^']+)'\)/g;
  let m;
  const righe = src.split('\n');
  for (const riga of righe) {
    const nomi = [...riga.matchAll(re)].map(x => x[1]);
    if (!nomi.length) continue;
    if (!/^\s*(\}\s*)?if \(/.test(riga)) continue;      // solo le righe che smistano
    const [primo, ...resto] = nomi;
    /* Un `&& !u.pathname.startsWith('/x')` sulla stessa riga è un'esclusione. */
    const esclude = /&&\s*!/.test(riga) ? resto : [];
    fuori.push({ nome: primo, esclude });
  }
  return fuori;
}

/** Quali rotte non possono MAI essere raggiunte, dato l'ordine e le esclusioni. */
function irraggiungibili(rotte) {
  const morte = [];
  for (let i = 0; i < rotte.length; i++) {
    const dopo = rotte[i];
    const rubata = rotte.slice(0, i).find(prima =>
      dopo.nome !== prima.nome &&
      dopo.nome.startsWith(prima.nome) &&
      !prima.esclude.some(e => dopo.nome.startsWith(e)));
    if (rubata) morte.push([rubata.nome, dopo.nome]);
  }
  return morte;
}

// ── 1. Il rilevatore riconosce il difetto e la sua correzione ───────────────
prova('il rilevatore vede una rotta mangiata', () => {
  /* Controprova del rilevatore stesso: se non riconoscesse il difetto,
     le prove qui sotto sarebbero verdi per niente. */
  const finto = rotteDi("    if (u.pathname.startsWith('/login')) {\n    if (u.pathname.startsWith('/logindump')) {");
  const m = irraggiungibili(finto);
  deve(m.length === 1 && m[0][1] === '/logindump', 'non rileva il caso noto: ' + JSON.stringify(m));
});

prova('il rilevatore capisce l\'esclusione esplicita', () => {
  const ok = rotteDi("    if (u.pathname.startsWith('/login') && !u.pathname.startsWith('/logindump')) {\n    if (u.pathname.startsWith('/logindump')) {");
  deve(irraggiungibili(ok).length === 0, 'segnala come morta una rotta che invece è raggiungibile');
});

// ── 2. Nessuno scraper ha rotte morte ───────────────────────────────────────
for (const c of TUTTI) {
  prova(c + ': ogni rotta dichiarata si può chiamare', () => {
    const src = fs.readFileSync(path.join(qui, '..', c, 'quote-service.mjs'), 'utf8');
    const rotte = rotteDi(src);
    const morte = irraggiungibili(rotte);
    deve(morte.length === 0,
      'irraggiungibili: ' + morte.map(([a, b]) => `'${b}' mangiata da '${a}'`).join(', '));
    return rotte.length + ' rotte';
  });
}

// ── 3. La diagnostica non deve poter togliere il freno ──────────────────────
for (const c of ['allianz', 'italiana']) {
  prova(c + ': chiedere una diagnostica non rimette in moto i login', () => {
    /* Il punto che rende questa correzione urgente e non estetica. */
    const src = fs.readFileSync(path.join(qui, '..', c, 'quote-service.mjs'), 'utf8');
    const i = src.indexOf('FRENO.sblocca()');
    deve(i > 0, 'lo sblocco del freno è sparito');
    const attorno = src.slice(Math.max(0, i - 700), i);
    deve(/startsWith\('\/login'\)\s*&&\s*!u\.pathname\.startsWith\('\/logindump'\)/.test(attorno),
      'lo sblocco è raggiungibile da /logindump: una diagnostica riaprirebbe il ciclo di login');
  });
}

let ko = 0;
console.log('\nROTTE VIVE — nessuna deve essere irraggiungibile');
for (const [ok, nome, msg] of esiti) {
  console.log(ok ? '  ok  ' + nome + (msg ? ' — ' + msg : '') : '  X   ' + nome + ' — ' + msg);
  if (!ok) ko++;
}
console.log(`\nROTTE VIVE: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
