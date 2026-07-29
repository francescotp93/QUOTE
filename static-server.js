// ─────────────────────────────────────────────────────────────────────────────
// COLLAUDO — server statico locale
// Serve il repository QUOTE sulla porta 8077 così la suite ui-test.mjs può
// aprire l'app in un browser senza toccare la produzione. Nessuna dipendenza.
//
//   node static-server.js &     (poi: node ui-test.mjs)
// ─────────────────────────────────────────────────────────────────────────────
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RADICE = path.dirname(fileURLToPath(import.meta.url));
const PORTA = Number(process.env.PORTA || 8077);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

const server = http.createServer((req, res) => {
  try {
    // solo il percorso, senza query né hash
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    // niente uscite dalla radice del repo
    const file = path.normalize(path.join(RADICE, p));
    if (!file.startsWith(RADICE)) { res.writeHead(403); res.end(); return; }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('non trovato: ' + p);
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    res.writeHead(500); res.end(String(e && e.message || e));
  }
});

server.listen(PORTA, () => {
  console.log('[collaudo] repository QUOTE servito su http://127.0.0.1:' + PORTA + '/');
});
