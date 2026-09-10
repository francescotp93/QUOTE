// ═══════════════════════════════════════════════════════════════════════════════
//  CORS — l'estensione Chrome non e' un sito, ma deve poter consegnare
//
//  «Indica catture arrivate 0» (Francesco, 10/09/2026). La porta delle catture
//  rispondeva bene a chiunque, tranne a chi doveva usarla: il service worker
//  dell'estensione chiama con Origin «chrome-extension://<id>», il filtro CORS
//  lo rifiutava con un errore e la risposta diventava 500. Qui si ESEGUE il
//  filtro, estratto dal sorgente, con le origini che contano.
//
//      node server/verifica/cors-estensione.test.mjs
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(RADICE, 'index.js'), 'utf8');
const esiti = [];
const prova = (n, f) => { try { esiti.push([true, n, f() || '']); } catch (e) { esiti.push([false, n, e.message]); } };
const deve = (c, m) => { if (!c) throw new Error(m); };

function filtro() {
  const mE = src.match(/const eEstensione = (.*?);\n/);
  const mO = src.match(/origin\(origin, cb\) \{([\s\S]*?)\n  \},/);
  deve(mE && mO, 'non trovo il filtro CORS o eEstensione');
  const ALLOWED = ['https://iam.withusassicurazioni.it', 'https://quoto.withusassicurazioni.it', 'https://www.withusassicurazioni.it'];
  const fn = new Function('ALLOWED', 'const eEstensione = ' + mE[1] + '; return function (origin, cb) {' + mO[1] + '\n};')(ALLOWED);
  return (origin) => { let esito; fn(origin, (err, ok) => { esito = err ? 'no' : (ok ? 'si' : 'no'); }); return esito; };
}

prova('l\'estensione passa, i nostri siti passano, e chi non ha origine passa', () => {
  const f = filtro();
  deve(f('chrome-extension://abcdefghijklmnopabcdefghijklmnop') === 'si', 'l\'estensione viene rifiutata: la cattura torna 500');
  deve(f('https://iam.withusassicurazioni.it') === 'si' && f('https://quoto.withusassicurazioni.it') === 'si', 'un nostro sito viene rifiutato');
  deve(f(undefined) === 'si', 'una chiamata senza Origin (curl, server) viene rifiutata');
  return 'estensione, siti nostri, senza origine';
});

prova('un sito qualunque e una finta estensione restano fuori', () => {
  const f = filtro();
  deve(f('https://evil.example') === 'no', 'un sito qualunque passa');
  deve(f('chrome-extension://evil.example') === 'no', 'basta scrivere chrome-extension:// davanti per passare');
  deve(f('chrome-extension://ABCDEFGHIJKLMNOPABCDEFGHIJKLMNOP') === 'no', 'un id fuori forma (Chrome usa solo a-p minuscole) passa');
  deve(f('https://iam.withusassicurazioni.it.evil.example') === 'no', 'un dominio che finge di essere nostro passa');
  return 'quattro estranei fuori';
});

prova('la chiave del connettore e\' fra le intestazioni ammesse', () => {
  const m = src.match(/allowedHeaders: \[([^\]]*)\]/);
  deve(m && /X-Connettore-Chiave/.test(m[1]), 'X-Connettore-Chiave non e\' ammessa: un preflight la bloccherebbe');
  return 'X-Connettore-Chiave ammessa';
});

let ko = 0;
console.log('\nCORS — l\'estensione consegna');
for (const [ok, n, m] of esiti) { console.log(ok ? '  ok  ' + n + (m ? ' — ' + m : '') : '  X   ' + n + '\n      ' + m); if (!ok) ko++; }
console.log(`\nCORS ESTENSIONE: ${esiti.length - ko} superate, ${ko} fallite\n`);
process.exit(ko === 0 ? 0 : 1);
