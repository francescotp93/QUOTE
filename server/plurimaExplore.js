// ═══ EXPLORER TEMPORANEO scraper (Plurima/Assieasy/...) — rimuovere dopo l'uso ═══
// Proxy verso il 'telecomando' HTTP di UNO scraper locale. Default: Italiana 4300.
// Param ?port=48xx per puntare un altro scraper (es. assieasy 4800). Solo 127.0.0.1.
// Op: status, login, loginstate, logindump, probe, goto, act, read, grepjs, products,
// jsgrep, api, sniffstart, sniffstop. NESSUN salva/emetti. Protetto da chiave.
import { Router } from 'express';

export const plurimaExploreRouter = Router();
const KEY = process.env.EXPLORE_KEY || 'leo-explore-Px7wQ2';
const DEFAULT = process.env.ITALIANA_SCRAPER_URL || 'http://127.0.0.1:4300';
function target(q) {
  const p = String(q.port || '');
  if (/^4[0-9]{3}$/.test(p)) return 'http://127.0.0.1:' + p;
  return DEFAULT;
}
function exploreQS(q, withGoto) {
  const u = new URLSearchParams();
  if (withGoto && q.path) u.set('goto', q.path);
  for (const k of ['click', 'fill', 'fillsel', 'enter', 'select', 'then', 'cf', 'hover', 'href', 'frame', 'all', 'sniff', 'grepjs']) if (q[k] != null && q[k] !== '') u.set(k, q[k]);
  return '/explore?' + u.toString();
}
const OPS = {
  status: () => '/status',
  goto: q => exploreQS(q, true),
  act: q => exploreQS(q, false),
  read: () => '/explore',
  login: () => '/accedi',
  loginstate: () => '/loginstate',
  logindump: () => '/logindump',
  probe: q => '/probe?q=' + encodeURIComponent(q.q || ''),
  grepjs: () => '/explore?grepjs=1',
  products: q => '/motoprobe?q=' + encodeURIComponent(q.q || ''),
  jsgrep: q => '/jsgrep?q=' + encodeURIComponent(q.q || '') + (q.file ? '&file=' + encodeURIComponent(q.file) : ''),
  api: q => { const p = new URLSearchParams(); for (const k of Object.keys(q)) { if (k === 'key' || k === 'op' || k === 'port') continue; p.set(k, q[k]); } return '/api?' + p.toString(); },
  sniffstart: () => '/sniff/start',
  sniffstop: () => '/sniff/stop',
};

plurimaExploreRouter.get('/', async (req, res) => {
  if ((req.query.key || '') !== KEY) return res.status(403).json({ error: 'chiave non valida' });
  const op = String(req.query.op || 'status');
  if (!OPS[op]) return res.status(400).json({ error: 'op non consentita', consentite: Object.keys(OPS) });
  const SCR = target(req.query);
  const path = OPS[op](req.query);
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 120000);
  const started = Date.now();
  try {
    const r = await fetch(SCR + path, { signal: ctl.signal });
    const txt = await r.text();
    let data; try { data = JSON.parse(txt); } catch { data = { raw: txt.slice(0, 20000) }; }
    res.json({ op, scraper: SCR, path, status: r.status, ms: Date.now() - started, data });
  } catch (e) {
    res.json({ op, scraper: SCR, path, error: String((e && e.message) || e), ms: Date.now() - started });
  } finally { clearTimeout(t); }
});
