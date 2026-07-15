// ═══ EXPLORER TEMPORANEO (SOLA LETTURA) per mappare Plurima — rimuovere dopo l'uso ═══
// Proxy verso gli endpoint di SCOPERTA dello scraper Italiana/Plurima (127.0.0.1:4300).
// SOLO operazioni read-only: status, navigazione pagina, lista prodotti, grep JS, azioni
// di lettura. NESSUN calcolo premio, NESSUN login forzato, NESSUN salva/emetti.
// Protetto da chiave (?key=). Aggiunto da Leo per l'esplorazione di Plurima.
import { Router } from 'express';

export const plurimaExploreRouter = Router();
const SCR = process.env.ITALIANA_SCRAPER_URL || 'http://127.0.0.1:4300';
const KEY = process.env.EXPLORE_KEY || 'leo-explore-Px7wQ2';

const OPS = {
  status: () => '/status',
  goto: q => '/explore?goto=' + encodeURIComponent(q.path || '/')
    + (q.grepjs ? '&grepjs=1' : '') + (q.sniff ? '&sniff=1' : '')
    + (q.click ? '&click=' + encodeURIComponent(q.click) : '')
    + (q.select ? '&select=' + encodeURIComponent(q.select) : ''),
  grepjs: () => '/explore?grepjs=1',
  products: q => '/motoprobe?q=' + encodeURIComponent(q.q || ''),
  jsgrep: q => '/jsgrep?q=' + encodeURIComponent(q.q || '') + (q.file ? '&file=' + encodeURIComponent(q.file) : ''),
  api: q => { const p = new URLSearchParams(); for (const k of Object.keys(q)) { if (k === 'key' || k === 'op') continue; p.set(k, q[k]); } return '/api?' + p.toString(); },
  sniffstart: () => '/sniff/start',
  sniffstop: () => '/sniff/stop',
};

plurimaExploreRouter.get('/', async (req, res) => {
  if ((req.query.key || '') !== KEY) return res.status(403).json({ error: 'chiave non valida' });
  const op = String(req.query.op || 'status');
  if (!OPS[op]) return res.status(400).json({ error: 'op non consentita', consentite: Object.keys(OPS) });
  const path = OPS[op](req.query);
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 120000);
  const started = Date.now();
  try {
    const r = await fetch(SCR + path, { signal: ctl.signal });
    const txt = await r.text();
    let data; try { data = JSON.parse(txt); } catch { data = { raw: txt.slice(0, 20000) }; }
    res.json({ op, path, status: r.status, ms: Date.now() - started, data });
  } catch (e) {
    res.json({ op, path, error: String((e && e.message) || e), ms: Date.now() - started });
  } finally { clearTimeout(t); }
});
