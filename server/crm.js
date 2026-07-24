// ── CRM · Anagrafiche clienti ────────────────────────────────────────────────
// Espone la tabella `quote_anagrafiche` (definita in supabase/quote_schema.sql) come
// registro clienti lato gestore, sul modello del Portafoglio di Plurima.
// Montato in server/index.js sotto requireAuth (come /notify, /moto): tutte le rotte
// qui sono quindi gia protette dal login Supabase.
//
// Rotte:
//   GET    /crm/anagrafiche            lista + ricerca (q) + filtro lead + paginazione
//   GET    /crm/anagrafiche/:id        dettaglio singola anagrafica
//   POST   /crm/anagrafiche            crea
//   PUT    /crm/anagrafiche/:id        modifica (campi whitelisted)
//   DELETE /crm/anagrafiche/:id        elimina
import { Router } from 'express';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://ekjxrnsfqxnfxzrthdcf.supabase.co').replace(/\/$/, '');
const TABLE = 'quote_anagrafiche';

// Colonne accettate in scrittura (whitelist: evita di iniettare colonne arbitrarie).
const CAMPI = [
  'tipo', 'nominativo', 'cognome', 'nome', 'ragione_sociale', 'codice_fiscale', 'partita_iva',
  'tipo_societa', 'professione', 'stato_civile', 'data_nascita',
  'indirizzo', 'civico', 'cap', 'comune', 'provincia', 'nazione',
  'telefono', 'cellulare', 'email', 'pec', 'note', 'lead', 'lead_origine',
];

function sbHeaders(extra) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY non configurata');
  return { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', ...(extra || {}) };
}

// PostgREST: escape del valore dentro un filtro or=() — le virgole e parentesi romperebbero la query.
const safeLike = (s) => String(s).replace(/[(),]/g, ' ').trim();

// Costruisce il record dai soli campi ammessi presenti nel body.
function pickCampi(body) {
  const row = {};
  for (const k of CAMPI) if (body[k] !== undefined) row[k] = body[k];
  return row;
}

// Normalizza/valida il minimo indispensabile prima di scrivere.
function validaRow(row, { parziale } = {}) {
  if (!parziale) {
    if (!row.nominativo || !String(row.nominativo).trim()) return 'Il nominativo e obbligatorio.';
  }
  if (row.tipo && !['fisica', 'giuridica'].includes(row.tipo)) return "Il campo 'tipo' deve essere 'fisica' o 'giuridica'.";
  const cf = row.codice_fiscale ? String(row.codice_fiscale).trim() : '';
  if (cf && !(cf.length === 16 || cf.length === 11)) return 'Codice fiscale / P.IVA di lunghezza non valida (16 o 11).';
  return null;
}

export const crmRouter = Router();

// ── Lista + ricerca ──────────────────────────────────────────────────────────
crmRouter.get('/anagrafiche', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const params = new URLSearchParams();
    params.set('select', '*');
    params.set('order', 'creato_il.desc');
    if (req.query.lead === '1' || req.query.lead === 'true') params.set('lead', 'eq.true');
    else if (req.query.lead === '0' || req.query.lead === 'false') params.set('lead', 'eq.false');
    if (q) {
      const t = '*' + safeLike(q) + '*';
      params.set('or', `(nominativo.ilike.${t},codice_fiscale.ilike.${t},partita_iva.ilike.${t},email.ilike.${t},comune.ilike.${t})`);
    }
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?${params.toString()}`, {
      headers: sbHeaders({ Prefer: 'count=exact', Range: `${offset}-${offset + limit - 1}` }),
    });
    if (!r.ok) throw new Error('Supabase select: ' + (await r.text()).slice(0, 200));
    const rows = await r.json();
    const total = (r.headers.get('content-range') || '').split('/')[1] || null;
    res.json({ ok: true, total: total ? Number(total) : null, limit, offset, items: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Dettaglio ────────────────────────────────────────────────────────────────
crmRouter.get('/anagrafiche/:id', async (req, res) => {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(req.params.id)}&select=*`, { headers: sbHeaders() });
    if (!r.ok) throw new Error('Supabase select: ' + (await r.text()).slice(0, 200));
    const rows = await r.json();
    if (!rows.length) return res.status(404).json({ error: 'Anagrafica non trovata.' });
    res.json({ ok: true, item: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Crea ─────────────────────────────────────────────────────────────────────
crmRouter.post('/anagrafiche', async (req, res) => {
  try {
    const row = pickCampi(req.body || {});
    const err = validaRow(row, { parziale: false });
    if (err) return res.status(400).json({ error: err });
    if (req.user && req.user.sub) row.creato_da = req.user.sub;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
      method: 'POST', headers: sbHeaders({ Prefer: 'return=representation' }), body: JSON.stringify([row]),
    });
    if (!r.ok) throw new Error('Supabase insert: ' + (await r.text()).slice(0, 200));
    const rows = await r.json();
    res.json({ ok: true, item: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Modifica ─────────────────────────────────────────────────────────────────
crmRouter.put('/anagrafiche/:id', async (req, res) => {
  try {
    const row = pickCampi(req.body || {});
    if (!Object.keys(row).length) return res.status(400).json({ error: 'Nessun campo da aggiornare.' });
    const err = validaRow(row, { parziale: true });
    if (err) return res.status(400).json({ error: err });
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(req.params.id)}`, {
      method: 'PATCH', headers: sbHeaders({ Prefer: 'return=representation' }), body: JSON.stringify(row),
    });
    if (!r.ok) throw new Error('Supabase update: ' + (await r.text()).slice(0, 200));
    const rows = await r.json();
    if (!rows.length) return res.status(404).json({ error: 'Anagrafica non trovata.' });
    res.json({ ok: true, item: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Elimina ──────────────────────────────────────────────────────────────────
crmRouter.delete('/anagrafiche/:id', async (req, res) => {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(req.params.id)}`, {
      method: 'DELETE', headers: sbHeaders({ Prefer: 'return=representation' }),
    });
    if (!r.ok) throw new Error('Supabase delete: ' + (await r.text()).slice(0, 200));
    const rows = await r.json();
    if (!rows.length) return res.status(404).json({ error: 'Anagrafica non trovata.' });
    res.json({ ok: true, eliminata: rows[0].id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
