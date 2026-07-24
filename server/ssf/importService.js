/**
 * Import service SSF -> Supabase (Quoto + IM).
 * Upsert IDEMPOTENTE via PostgREST (Prefer: resolution=merge-duplicates) per chiave ssf_id_*.
 * Rieseguibile sui flussi giornalieri senza duplicare.
 *
 * ⚠️ Richiede che la migrazione supabase/ssf_schema_extensions.sql sia stata APPLICATA
 *    (colonne ssf_id_* + tabelle im_titoli/im_incassi). Fino ad allora l'upsert fallisce.
 *
 * fetch iniettabile (opts.fetch) per test/dry-run senza toccare il DB.
 */
const DEFAULT_URL = 'https://ekjxrnsfqxnfxzrthdcf.supabase.co';

function sbHeaders(key, extra) {
  return { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', ...(extra || {}) };
}

async function upsert(fetchImpl, url, key, table, rows, onConflict) {
  if (!rows || rows.length === 0) return { table, count: 0, rows: [] };
  const r = await fetchImpl(`${url}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: sbHeaders(key, { Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify(rows),
  });
  if (!r.ok) {
    const body = await (r.text ? r.text() : Promise.resolve('')).catch(() => '');
    throw new Error(`upsert ${table} HTTP ${r.status}: ${body}`);
  }
  const data = await (r.json ? r.json() : Promise.resolve([])).catch(() => []);
  return { table, count: rows.length, rows: Array.isArray(data) ? data : [] };
}

/**
 * Importa un modello gia mappato (output di mapWithus.mapModel).
 * @returns { quote_anagrafiche, quote_polizze, im_titoli, im_incassi } (conteggi)
 */
export async function importModel(mapped, opts = {}) {
  const fetchImpl = opts.fetch || fetch;
  const url = (opts.supabaseUrl || process.env.SUPABASE_URL || DEFAULT_URL).replace(/\/$/, '');
  const key = opts.serviceKey || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY non configurata');

  const report = {};

  // 1. Anagrafiche (upsert su ssf_id_anagrafica) -> serve l'id generato per collegare le polizze
  const anaRes = await upsert(fetchImpl, url, key, 'quote_anagrafiche', mapped.quote_anagrafiche, 'ssf_id_anagrafica');
  report.quote_anagrafiche = anaRes.count;
  const anaIdBySsf = {};
  for (const row of anaRes.rows) if (row && row.ssf_id_anagrafica) anaIdBySsf[row.ssf_id_anagrafica] = row.id;

  // 2. Polizze: risolvi anagrafica_id (FK) dal ssf_id, poi upsert su ssf_id_polizza
  const polizze = mapped.quote_polizze.map((p) => ({ ...p, anagrafica_id: anaIdBySsf[p.ssf_id_anagrafica] || null }));
  report.quote_polizze = (await upsert(fetchImpl, url, key, 'quote_polizze', polizze, 'ssf_id_polizza')).count;

  // 3. Titoli (IM)
  report.im_titoli = (await upsert(fetchImpl, url, key, 'im_titoli', mapped.im_titoli, 'ssf_id_titolo')).count;

  // 4. Incassi (IM)
  report.im_incassi = (await upsert(fetchImpl, url, key, 'im_incassi', mapped.im_incassi, 'ssf_id_incasso')).count;

  return report;
}
