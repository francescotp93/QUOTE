/* ═══════════════════════════════════════════════════════════════════════════
   CONTROLLA — lancia tutte le prove di With Us One
   Si usa così:  node withus-one/verifica/controlla.mjs
   ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const cartella = path.dirname(fileURLToPath(import.meta.url));
const prove = fs.readdirSync(cartella).filter(f => f.endsWith('.test.mjs')).sort();

if (!prove.length) { console.log('CONTROLLO: nessuna prova trovata'); process.exit(1); }

const falliti = [];
for (const p of prove) {
  const r = spawnSync(process.execPath, [path.join(cartella, p)], { cwd: cartella, encoding: 'utf8' });
  process.stdout.write(r.stdout || '');
  if (r.stderr) process.stdout.write(r.stderr);
  if (r.status !== 0) falliti.push(p);
  console.log('');
}

console.log('═══════════════════════════════════════════════════════');
console.log(falliti.length === 0
  ? `WITH US ONE: tutte le ${prove.length} prove sono superate`
  : `WITH US ONE: ${falliti.length} prove su ${prove.length} sono fallite — ${falliti.join(', ')}`);
process.exit(falliti.length === 0 ? 0 : 1);
