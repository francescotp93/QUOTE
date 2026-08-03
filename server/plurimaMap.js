// ═══════════════════════════════════════════════════════════════════════════════
//  plurimaMap.js — SONDA TEMPORANEA (SOLA LETTURA) per mappare il portale Plurima.
//  Interroga gli endpoint di SCOPERTA dello scraper Italiana (127.0.0.1:4300):
//  menu, lista prodotti, elenco azioni del portale. NESSUN calcolo premio, NESSUNA
//  emissione, NESSUN salvataggio. Protetta da chiave (?key=). DA RIMUOVERE dopo l'uso.
//  Aggiunta da Leo per l'esplorazione di Plurima (Fase 5).
// ═══════════════════════════════════════════════════════════════════════════════
import { Router } from 'express';

export const plurimaMapRouter = Router();

const SCR = process.env.ITALIANA_SCRAPER_URL || 'http://127.0.0.1:4300';
const KEY = process.env.PLURIMA_MAP_KEY || 'leo-plurima-7Kx9Qw2mZ';

async function call(path, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms || 60000);
  const started = Date.now();
  try {
    const r = await fetch(SCR + path, { signal: ctl.signal });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 4000) }; }
    return { path, status: r.status, ms: Date.now() - started, data };
  } catch (e) {
    return { path, error: String((e && e.message) || e), ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

// GET /plurima-map?key=...  → esegue in SERIE una manciata di chiamate leggere e
// in sola lettura, e restituisce tutto insieme. Se una fallisce, le altre proseguono.
plurimaMapRouter.get('/', async (req, res) => {
  if ((req.query.key || '') !== KEY) return res.status(403).json({ error: 'chiave non valida' });
  const steps = [];
  steps.push(await call('/status', 15000));
  steps.push(await call('/explore?goto=/', 60000));
  steps.push(await call('/explore?goto=/preventivazione', 60000));
  steps.push(await call('/explore?grepjs=1', 90000));
  steps.push(await call('/motoprobe?q=a', 60000));
  steps.push(await call('/motoprobe?q=e', 60000));
  res.json({ ok: true, scraper: SCR, generatedAt: new Date().toISOString(), steps });
});
