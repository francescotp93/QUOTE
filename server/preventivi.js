// ── QUOTO · Preventivi (M3) ──────────────────────────────────────────────────
// API del preventivatore data-driven. Montato sotto requireAuth in index.js.
//   POST /preventivi            crea (crea l'anagrafica al volo se serve) + denormalizza
//   GET  /preventivi            role-aware: collaboratore = i propri; staff ?scope=all = tutti
//   GET  /preventivi/:id        dettaglio (collaboratore solo i propri)
//   POST /preventivi/quota      dispatcher: 'richiedi' = end-to-end; 'calcola' = da_collegare
//
// Il backend usa SUPABASE_SERVICE_ROLE_KEY (bypassa le RLS): la "doppia vista"
// e' garantita QUI nel codice (filtro creato_da), non dalle policy.
import { Router } from 'express';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://ekjxrnsfqxnfxzrthdcf.supabase.co').replace(/\/$/, '');
const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || 'francesco.oddo199307@gmail.com').toLowerCase();
const STAFF_RUOLI = ['admin', 'master', 'top_master'];

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
async function sbInsert(table, row) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST', headers: sbHeaders({ Prefer: 'return=representation' }), body: JSON.stringify([row]),
  });
  if (!r.ok) throw new Error('Supabase insert: ' + (await r.text()).slice(0, 200));
  return (await r.json())[0];
}
async function sbPatch(table, idCol, idVal, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${idCol}=eq.${encodeURIComponent(idVal)}`, {
    method: 'PATCH', headers: sbHeaders({ Prefer: 'return=representation' }), body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('Supabase patch: ' + (await r.text()).slice(0, 200));
  return (await r.json())[0];
}
const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''));

// Ruolo: staff se Super Admin per email o ruolo di staff in quote_utenti.
async function isStaff(req) {
  const email = (req.user && req.user.email || '').toLowerCase();
  if (email && email === SUPER_ADMIN_EMAIL) return true;
  try {
    const u = await sbGet(`quote_utenti?id=eq.${encodeURIComponent(req.user.id)}&select=ruolo&limit=1`);
    return !!(u[0] && STAFF_RUOLI.includes(String(u[0].ruolo || '').toLowerCase()));
  } catch (_) { return false; }
}
async function nomeUtente(req) {
  try {
    const u = await sbGet(`quote_utenti?id=eq.${encodeURIComponent(req.user.id)}&select=nome&limit=1`);
    if (u[0] && u[0].nome) return u[0].nome;
  } catch (_) {}
  return (req.user && req.user.email) || 'Operatore';
}

// Risolve un prodotto dal catalogo per id (uuid) o codice (slug).
async function getProdotto(idOrCodice) {
  if (!idOrCodice) return null;
  const col = isUuid(idOrCodice) ? 'id' : 'codice';
  const rows = await sbGet(`quote_prodotti_catalogo?${col}=eq.${encodeURIComponent(idOrCodice)}&limit=1`);
  return rows[0] || null;
}

export const preventiviRouter = Router();

// ── CREA ─────────────────────────────────────────────────────────────────────
preventiviRouter.post('/', async (req, res) => {
  try {
    const b = req.body || {};
    const prodotto = await getProdotto(b.prodotto_id || b.codice);
    if (!prodotto) return res.status(400).json({ error: 'Prodotto non valido o mancante.' });

    // Cliente: o anagrafica esistente (cliente_id) o creazione al volo dai dati anagrafica.
    let clienteId = b.cliente_id || null;
    let nominativo = '';
    if (clienteId) {
      const a = await sbGet(`quote_anagrafiche?id=eq.${encodeURIComponent(clienteId)}&select=nominativo&limit=1`);
      if (!a.length) return res.status(400).json({ error: 'Anagrafica cliente non trovata.' });
      nominativo = a[0].nominativo;
    } else if (b.anagrafica && (b.anagrafica.nominativo || b.anagrafica.cognome || b.anagrafica.ragione_sociale)) {
      const src = b.anagrafica;
      nominativo = String(src.nominativo || [src.cognome, src.nome].filter(Boolean).join(' ') || src.ragione_sociale || '').trim();
      if (!nominativo) return res.status(400).json({ error: 'Nominativo cliente obbligatorio.' });
      const CAMPI = ['tipo','nominativo','cognome','nome','ragione_sociale','codice_fiscale','partita_iva','tipo_societa','professione','stato_civile','data_nascita','indirizzo','civico','cap','comune','provincia','nazione','telefono','cellulare','email','pec','note'];
      const row = { nominativo, creato_da: req.user.id };
      for (const k of CAMPI) if (src[k] !== undefined) row[k] = src[k];
      const created = await sbInsert('quote_anagrafiche', row);
      clienteId = created.id;
    } else {
      return res.status(400).json({ error: 'Serve un cliente: cliente_id oppure i dati anagrafica.' });
    }

    const row = {
      modulo: prodotto.ramo,
      prodotto: prodotto.nome,
      prodotto_id: prodotto.id,
      cliente_id: clienteId,
      cliente: nominativo,
      compagnia: null,
      premio: null,
      stato: 'bozza',
      offerta: b.offerta ?? null,
      compagnie_sel: Array.isArray(b.compagnie_sel) ? b.compagnie_sel : null,
      coperture: b.coperture ?? null,
      dati: b.dati ?? {},
      creato_da: req.user.id,
      creato_nome: await nomeUtente(req),
    };
    const prev = await sbInsert('quote_preventivi', row);
    res.status(201).json({ ok: true, preventivo: prev });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── LISTA (role-aware) ───────────────────────────────────────────────────────
preventiviRouter.get('/', async (req, res) => {
  try {
    const staff = await isStaff(req);
    const scopeAll = staff && (req.query.scope === 'all');
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const params = new URLSearchParams();
    params.set('select', '*');
    params.set('order', 'creato_il.desc');
    if (!scopeAll) params.set('creato_da', 'eq.' + req.user.id);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/quote_preventivi?${params.toString()}`, {
      headers: sbHeaders({ Prefer: 'count=exact', Range: `${offset}-${offset + limit - 1}` }),
    });
    if (!r.ok) throw new Error('Supabase select: ' + (await r.text()).slice(0, 200));
    const rows = await r.json();
    const total = (r.headers.get('content-range') || '').split('/')[1] || null;
    res.json({ ok: true, staff, scope: scopeAll ? 'all' : 'own', total: total ? Number(total) : null, limit, offset, items: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DETTAGLIO ────────────────────────────────────────────────────────────────
preventiviRouter.get('/:id', async (req, res) => {
  try {
    const rows = await sbGet(`quote_preventivi?id=eq.${encodeURIComponent(req.params.id)}&limit=1`);
    if (!rows.length) return res.status(404).json({ error: 'Preventivo non trovato.' });
    const p = rows[0];
    if (p.creato_da !== req.user.id && !(await isStaff(req))) return res.status(403).json({ error: 'Non autorizzato.' });
    res.json({ ok: true, preventivo: p });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DISPATCHER QUOTA ─────────────────────────────────────────────────────────
// 'richiedi' = flusso completo (marca lo stato 'richiesto').
// 'calcola'  = premio a sistema: adapter tariffa NON ancora collegato -> 'da_collegare'.
preventiviRouter.post('/quota', async (req, res) => {
  try {
    const b = req.body || {};
    let prodotto = null;
    let prevId = b.preventivo_id || null;
    if (prevId) {
      const rows = await sbGet(`quote_preventivi?id=eq.${encodeURIComponent(prevId)}&limit=1`);
      if (!rows.length) return res.status(404).json({ error: 'Preventivo non trovato.' });
      if (rows[0].creato_da !== req.user.id && !(await isStaff(req))) return res.status(403).json({ error: 'Non autorizzato.' });
      prodotto = await getProdotto(rows[0].prodotto_id);
    } else {
      prodotto = await getProdotto(b.prodotto_id || b.codice);
    }
    if (!prodotto) return res.status(400).json({ error: 'Prodotto non valido o mancante.' });

    if (prodotto.tipo_quotazione === 'richiedi') {
      if (prevId) await sbPatch('quote_preventivi', 'id', prevId, { stato: 'richiesto' });
      return res.json({ ok: true, stato: 'richiesto', tipo_quotazione: 'richiedi',
        message: 'Richiesta registrata: la quotazione verra gestita dall’ufficio.' });
    }

    // tipo_quotazione === 'calcola'
    return res.json({
      ok: true, stato: 'da_collegare', tipo_quotazione: 'calcola', premi: [],
      compagnie: prodotto.compagnie || [],
      message: 'Adapter tariffa non ancora collegato per questo prodotto: premio non calcolato.',
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
