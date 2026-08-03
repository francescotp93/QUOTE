// ── QUOTO · Catalogo prodotti (sola lettura) ─────────────────────────────────
// Espone quote_prodotti_catalogo (supabase/quote_prodotti_catalogo.sql).
// Montato sotto requireAuth in server/index.js: tutte le rotte richiedono login.
//   GET /catalogo/rami            elenco rami distinti (con conteggio prodotti attivi)
//   GET /catalogo/prodotti        elenco prodotti attivi (filtro opzionale ?ramo=)
//   GET /catalogo/prodotto/:id    dettaglio singolo prodotto (per id o codice)
import { Router } from 'express';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://ekjxrnsfqxnfxzrthdcf.supabase.co').replace(/\/$/, '');
const TABLE = 'quote_prodotti_catalogo';

function sbHeaders(extra) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY non configurata');
  return { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', ...(extra || {}) };
}
async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders() });
  if (!r.ok) throw new Error('Supabase select: ' + (await r.text()).slice(0, 200));
  return r.json();
}
const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''));

export const catalogoRouter = Router();

// Elenco prodotti attivi (opz. per ramo), ordinati.
catalogoRouter.get('/prodotti', async (req, res) => {
  try {
    const params = new URLSearchParams();
    params.set('select', '*');
    params.set('attivo', 'eq.true');
    params.set('order', 'ordine.asc');
    const ramo = String(req.query.ramo || '').trim();
    if (ramo) params.set('ramo', 'eq.' + ramo);
    const rows = await sbGet(`${TABLE}?${params.toString()}`);
    res.json({ ok: true, items: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Rami distinti con conteggio prodotti attivi (derivati dai prodotti).
catalogoRouter.get('/rami', async (req, res) => {
  try {
    const rows = await sbGet(`${TABLE}?select=ramo,nome,ordine,tipo_quotazione&attivo=eq.true&order=ordine.asc`);
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.ramo)) map.set(r.ramo, { ramo: r.ramo, prodotti: 0, ordine: r.ordine });
      map.get(r.ramo).prodotti++;
    }
    res.json({ ok: true, items: [...map.values()].sort((a, b) => a.ordine - b.ordine) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Dettaglio per id (uuid) o codice (slug).
catalogoRouter.get('/prodotto/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const col = isUuid(id) ? 'id' : 'codice';
    const rows = await sbGet(`${TABLE}?${col}=eq.${encodeURIComponent(id)}&limit=1`);
    if (!rows.length) return res.status(404).json({ error: 'Prodotto non trovato.' });
    res.json({ ok: true, prodotto: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
