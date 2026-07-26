/**
 * QUOTO — Portafoglio: scadenzario/rinnovi + CRM opportunità (cross-selling).
 * Replica funzionale di AssiEasy (Avvisi di scadenza + Analisi CRM "Clienti auto
 * senza tutela/infortuni"). ESM. Lavora su quote_polizze / quote_anagrafiche.
 * ⚠️ Richiede quote_polizze applicata (supabase/quote_polizze.sql).
 */
const DEFAULT_URL = 'https://ekjxrnsfqxnfxzrthdcf.supabase.co';
const SB_URL = (process.env.SUPABASE_URL || DEFAULT_URL).replace(/\/$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbHeaders = () => ({ apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' });
async function sbGet(pathq) {
  const res = await fetch(`${SB_URL}/rest/v1/${pathq}`, { headers: sbHeaders() });
  if (!res.ok) throw new Error(`GET ${pathq} HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}
const POL_SELECT = 'id,anagrafica_id,contraente,compagnia,ramo,prodotto,numero_polizza,targa,decorrenza,scadenza,premio,stato';

// ───────────────────────── LOGICA PURA (testabile) ─────────────────────────

/**
 * Clienti con AUTO ma senza una determinata copertura (cross-selling).
 * @param polizzeAuto righe polizze auto/motor [{anagrafica_id,contraente,...}]
 * @param polizzeCopertura righe polizze della copertura target [{anagrafica_id}]
 * @returns clienti unici (per anagrafica_id) che hanno auto e NON hanno la copertura
 */
export function clientiSenzaCopertura(polizzeAuto, polizzeCopertura) {
  const conCopertura = new Set((polizzeCopertura || []).map((p) => p.anagrafica_id).filter(Boolean));
  const visti = new Set();
  const out = [];
  for (const p of polizzeAuto || []) {
    const a = p.anagrafica_id;
    if (!a || conCopertura.has(a) || visti.has(a)) continue;
    visti.add(a);
    out.push({ anagrafica_id: a, contraente: p.contraente || null, numero_polizza_auto: p.numero_polizza || null, scadenza_auto: p.scadenza || null });
  }
  return out;
}

// ───────────────────────── SCADENZARIO / RINNOVI ─────────────────────────

/** Polizze in scadenza nel periodo [dal, al] (default: prossimi 60 gg). */
export async function scadenzario({ dal, al } = {}) {
  const oggi = new Date().toISOString().slice(0, 10);
  const d = dal || oggi;
  const a = al || new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
  const rows = await sbGet(`quote_polizze?select=${POL_SELECT}&stato=eq.attiva&scadenza=gte.${d}&scadenza=lte.${a}&order=scadenza.asc&limit=1000`);
  return { periodo: { dal: d, al: a }, count: rows.length, polizze: rows };
}

/** Polizze in mora (scadute e ancora attive). */
export async function inMora() {
  const oggi = new Date().toISOString().slice(0, 10);
  const rows = await sbGet(`quote_polizze?select=${POL_SELECT}&stato=eq.attiva&scadenza=lt.${oggi}&order=scadenza.asc&limit=1000`);
  return { count: rows.length, polizze: rows };
}

// ───────────────────────── CRM OPPORTUNITÀ (cross-selling) ─────────────────────────

const AUTO_FILTER = 'or=(ramo.ilike.*auto*,ramo.ilike.*motor*,prodotto.ilike.*auto*,prodotto.ilike.*motor*)';

/** Clienti con auto senza la copertura indicata (es. 'tutela', 'infortun'). */
export async function opportunitaCrossSelling(coperturaKeyword = 'tutela') {
  const kw = String(coperturaKeyword).replace(/[^a-zA-Z]/g, '');
  const auto = await sbGet(`quote_polizze?select=anagrafica_id,contraente,numero_polizza,scadenza&${AUTO_FILTER}&stato=eq.attiva&limit=5000`);
  const cov = await sbGet(`quote_polizze?select=anagrafica_id&or=(ramo.ilike.*${kw}*,prodotto.ilike.*${kw}*)&limit=5000`);
  const clienti = clientiSenzaCopertura(auto, cov);
  return { copertura: coperturaKeyword, count: clienti.length, clienti };
}
