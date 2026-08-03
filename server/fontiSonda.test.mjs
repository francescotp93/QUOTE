// Prova sul caso REALE che rallentava il pannello: scraper ACCESI ma LENTI a rispondere
// (browser Playwright occupato da una quotazione, lock preso). Sono questi a costare i 6s
// pieni ciascuno, non i servizi spenti (che rifiutano la connessione all'istante).
import http from 'http';
import { sondaTutte, invalidaTutto } from './fontiSonda.js';

const LENTI = [4911, 4912, 4913];   // rispondono dopo 8s: oltre ogni timeout
const VELOCI = [4914, 4915];        // rispondono subito
const server = [];

function finto(porta, ritardoMs) {
  return new Promise(r => {
    const s = http.createServer((req, res) => {
      setTimeout(() => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ url: 'https://portale/x', loggato: true })); }, ritardoMs);
    });
    s.listen(porta, '127.0.0.1', () => r(s));
  });
}
for (const p of LENTI) server.push(await finto(p, 8000));
for (const p of VELOCI) server.push(await finto(p, 120));

const tutte = [...LENTI, ...VELOCI].map(p => ({ id: 'p' + p, surl: 'http://127.0.0.1:' + p }));

// ── VECCHIO METODO: una alla volta, timeout 6s ciascuna ────────────────────────
const t0 = Date.now();
for (const v of tutte) {
  try { const c = new AbortController(); const to = setTimeout(() => c.abort(), 6000); await fetch(v.surl + '/status', { signal: c.signal }); clearTimeout(to); } catch {}
}
const vecchio = Date.now() - t0;

// ── NUOVO METODO: tutte insieme, timeout 3,5s ─────────────────────────────────
invalidaTutto();
const t1 = Date.now(); await sondaTutte(tutte); const nuovo1 = Date.now() - t1;
const t2 = Date.now(); await sondaTutte(tutte); const nuovo2 = Date.now() - t2;   // micro-cache
invalidaTutto();
await sondaTutte(tutte);                                                          // 2° guasto → interruttore
const t3 = Date.now(); await sondaTutte(tutte); const nuovo3 = Date.now() - t3;

console.log('\n5 fonti, di cui 3 accese ma lente (8s) e 2 veloci\n');
console.log('  vecchio metodo (in fila, 6s ciascuna)  ', vecchio + ' ms');
console.log('  nuovo, prima apertura                  ', nuovo1 + ' ms');
console.log('  nuovo, apertura ravvicinata (cache)    ', nuovo2 + ' ms');
console.log('  nuovo, con interruttore aperto         ', nuovo3 + ' ms');
console.log('\n  guadagno alla prima apertura: ' + Math.round(vecchio / Math.max(nuovo1, 1)) + '× più veloce\n');

const ok = nuovo1 < 5000 && nuovo2 < 100 && nuovo3 < 1500 && vecchio > 15000;
console.log(ok ? '✅ fortificazione efficace' : '❌ risultati fuori attesa');
for (const s of server) s.close();
process.exit(ok ? 0 : 1);
