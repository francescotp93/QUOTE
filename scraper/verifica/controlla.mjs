// ═══════════════════════════════════════════════════════════════════════════════
//  BANCO DI PROVA DEGLI SCRAPER — un comando solo
//
//      node scraper/verifica/controlla.mjs
//
//  Ogni file verifica/*.test.mjs è indipendente e si chiude con esito 0 se è
//  tutto verde. Qui si lanciano tutti e si somma.
//
//  Nessuna prova qui dentro avvia un browser o tocca la rete: gli scraper si
//  provano nei loro pezzi puri (scraper/comune/) e leggendo i sorgenti. Questa
//  è una scelta, non un limite accettato: un modulo che per essere provato ha
//  bisogno del portale di una compagnia è un modulo progettato male, e sul
//  campo si potrà provare solo quando la macchina sarà raggiungibile.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const cartella = path.dirname(fileURLToPath(import.meta.url));
const prove = fs.readdirSync(cartella).filter(f => f.endsWith('.test.mjs')).sort();

let falliti = 0;
for (const f of prove) {
  const r = spawnSync(process.execPath, [path.join(cartella, f)], { encoding: 'utf8' });
  process.stdout.write(r.stdout || '');
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) falliti++;
}

console.log('═══════════════════════════════════════════════════════');
console.log(falliti === 0
  ? `SCRAPER: tutte le ${prove.length} prove sono superate`
  : `SCRAPER: ${falliti} prove su ${prove.length} FALLITE`);
process.exit(falliti === 0 ? 0 : 1);
