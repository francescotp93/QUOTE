// ═══════════════════════════════════════════════════════════════════════════════
//  FONTI — chi entra nel pannello
//
//  «Sblocca le funzioni di fonti anche per l'account di
//  lombardo.angelo955@gmail.com» (Francesco, 10/09/2026). Il cancello del
//  pannello Fonti passa da un indirizzo solo a un elenco; le caselle di posta
//  restano del solo Super Admin. Si prova sul sorgente perche' fonti.js
//  importa Express, che in sandbox non c'e'.
//
//      node server/verifica/fonti-staff.test.mjs
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(RADICE, 'fonti.js'), 'utf8');
const esiti = [];
const prova = (n, f) => { try { esiti.push([true, n, f() || '']); } catch (e) { esiti.push([false, n, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

/* L'elenco si ESEGUE, non si cerca: una prova che trova l'indirizzo in un
   commento passerebbe anche col cancello chiuso. */
function elenco(env) {
  const m = src.match(/export const FONTI_STAFF = ([\s\S]*?\.filter\(Boolean\)\)\);)/);
  deve(m, 'non trovo FONTI_STAFF');
  const SUPER_ADMIN_EMAIL = 'francesco.oddo199307@gmail.com';
  return new Function('process', 'SUPER_ADMIN_EMAIL', 'return ' + m[1].replace(/;$/, ''))({ env: env || {} }, SUPER_ADMIN_EMAIL);
}

prova('Angelo entra, il Super Admin resta, e un estraneo no', () => {
  const st = elenco();
  deve(st.includes('lombardo.angelo955@gmail.com'), 'Angelo non e\' nell\'elenco');
  deve(st.includes('francesco.oddo199307@gmail.com'), 'il Super Admin e\' uscito dall\'elenco');
  deve(!st.includes('estraneo@example.it'), 'un indirizzo qualunque e\' dentro');
  deve(st.length === 2, 'l\'elenco ha ' + st.length + ' voci, attese 2');
  return st.join(', ');
});

prova('l\'ambiente aggiunge senza toccare il codice, e le maiuscole non contano', () => {
  const st = elenco({ FONTI_STAFF: ' Nuovo@Example.IT, ,altro@example.it' });
  deve(st.includes('nuovo@example.it') && st.includes('altro@example.it'), 'FONTI_STAFF nell\'ambiente non aggiunge: ' + st.join(','));
  deve(!st.includes(''), 'una virgola di troppo mette un indirizzo vuoto nell\'elenco');
  return 'due aggiunti dall\'ambiente';
});

prova('il cancello del pannello usa l\'elenco, non l\'indirizzo solo', () => {
  const gate = src.slice(src.indexOf('fontiRouter.use((req, res, next) => {'), src.indexOf('const soloSuperAdmin'));
  deve(/puoGestireFonti\(req\.user && req\.user\.email\)/.test(gate), 'il cancello non passa dall\'elenco');
  deve(!/!== SUPER_ADMIN_EMAIL/.test(gate), 'il cancello confronta ancora con un indirizzo solo');
  deve(/Riservato a chi gestisce le fonti/.test(gate), 'il rifiuto dice ancora «Super Admin», che non e\' piu\' vero');
  return 'elenco, con il messaggio giusto';
});

prova('le caselle di posta restano del solo Super Admin', () => {
  for (const r of ["fontiRouter.get('/caselle-mail'", "fontiRouter.post('/caselle-mail'", "fontiRouter.delete('/caselle-mail/:email'"]) {
    const i = src.indexOf(r);
    deve(i > -1, 'non trovo ' + r);
    deve(/soloSuperAdmin/.test(src.slice(i, i + r.length + 40)), r + ' e\' aperta a tutto lo staff delle fonti');
  }
  const sa = src.slice(src.indexOf('const soloSuperAdmin'), src.indexOf('const soloSuperAdmin') + 300);
  deve(/toLowerCase\(\) !== SUPER_ADMIN_EMAIL/.test(sa), 'soloSuperAdmin non confronta con il Super Admin');
  return 'tre rotte, un cancello a parte';
});

let ko = 0;
console.log('\nFONTI — chi entra nel pannello');
for (const [ok, n, m] of esiti) { console.log(ok ? '  ok  ' + n + (m ? ' — ' + m : '') : '  X   ' + n + '\n      ' + m); if (!ok) ko++; }
console.log(`\nFONTI STAFF: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
