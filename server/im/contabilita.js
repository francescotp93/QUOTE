/**
 * IM — Contabilità dell'intermediario (nucleo partita doppia).
 * Replica funzionale di AssiEasy: causali (template Dare/Avere) -> prima nota,
 * e quadratura (saldo finanziario/economico/direzione) dai flag del piano conti.
 * ESM. Logica pura testabile + helper Supabase (PostgREST, service_role).
 * ⚠️ Le funzioni DB richiedono la migrazione supabase/im_contabilita.sql applicata.
 */
const DEFAULT_URL = 'https://ekjxrnsfqxnfxzrthdcf.supabase.co';
const SB_URL = (process.env.SUPABASE_URL || DEFAULT_URL).replace(/\/$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbHeaders = (extra) => ({ apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', ...(extra || {}) });
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// ───────────────────────── LOGICA PURA (testabile) ─────────────────────────

/**
 * Genera le righe di prima nota da un template di causale applicando l'importo.
 * Ogni riga template (D/A) riceve l'importo nel lato corrispondente.
 * @returns { righe:[{sottoconto,dare,avere,descrizione}], totaleDare, totaleAvere, sbilancio }
 */
export function buildMovimentoRighe(righeTemplate, importo) {
  const imp = r2(importo);
  const righe = (righeTemplate || []).map((t) => ({
    sottoconto: t.sottoconto,
    dare: t.dare_avere === 'D' ? imp : 0,
    avere: t.dare_avere === 'A' ? imp : 0,
    descrizione: t.descrizione || null,
  }));
  const tD = r2(righe.reduce((s, x) => s + x.dare, 0));
  const tA = r2(righe.reduce((s, x) => s + x.avere, 0));
  return { righe, totaleDare: tD, totaleAvere: tA, sbilancio: r2(tD - tA) };
}

/**
 * Quadratura: dati i sottoconti (con i flag) e le righe contabili, calcola i saldi.
 * Convenzione: saldo netto sottoconto = Σdare − Σavere.
 *  - Totale Finanziari = Σ netto sui conti `e_finanziario` (liquidità: cassa/banca/POS/posta)
 *  - Totale Economici  = Σ netto sui conti `e_economico` (sospesi)
 *  - Totale Saldo Compagnie = Σ (avere−dare) sui conti `saldo_direzione` (debito v/compagnie)
 *  - Saldo Finanziario = Totale Finanziari − Totale Saldo Compagnie  ("posso pagare i premi?")
 *  - Saldo Economico   = Saldo Finanziario + Totale Economici        (redditività se incasso i sospesi)
 * (Convenzioni da validare sui numeri reali di AssiEasy.)
 */
export function computeQuadratura(pianoConti, righe) {
  const flags = {};
  for (const c of pianoConti) flags[c.codice] = c;
  const net = {}; // sottoconto -> Σdare-Σavere
  for (const r of righe) {
    const k = r.sottoconto;
    net[k] = r2((net[k] || 0) + Number(r.dare || 0) - Number(r.avere || 0));
  }
  let finanziari = 0, economici = 0, saldoCompagnie = 0, abbuoni = 0;
  const dettaglio = [];
  for (const [sc, n] of Object.entries(net)) {
    const f = flags[sc] || {};
    if (f.e_finanziario) finanziari = r2(finanziari + n);
    if (f.e_economico) economici = r2(economici + n);
    if (f.saldo_direzione) saldoCompagnie = r2(saldoCompagnie - n); // avere-dare
    if (f.abbuono) abbuoni = r2(abbuoni + n);
    dettaglio.push({ sottoconto: sc, descrizione: f.descrizione || null, saldo: n });
  }
  const saldoFinanziario = r2(finanziari - saldoCompagnie);
  const saldoEconomico = r2(saldoFinanziario + economici);
  return {
    totali: { finanziari, economici, saldoCompagnie, abbuoni },
    saldoFinanziario, saldoEconomico,
    dettaglio: dettaglio.sort((a, b) => a.sottoconto.localeCompare(b.sottoconto)),
  };
}

// ───────────────────────── HELPER SUPABASE ─────────────────────────
async function sbGet(pathq) {
  const res = await fetch(`${SB_URL}/rest/v1/${pathq}`, { headers: sbHeaders() });
  if (!res.ok) throw new Error(`GET ${pathq} HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}
async function sbPost(table, body, extra) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}`, { method: 'POST', headers: sbHeaders(extra), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`POST ${table} HTTP ${res.status}: ${await res.text()}`);
  return res.json().catch(() => []);
}

export const getPianoConti = () => sbGet('im_piano_conti?select=*&attivo=eq.true&order=codice');
export const getCausali = () => sbGet('im_causali?select=*,righe:im_causali_righe(*)&attivo=eq.true&order=codice');
export const listMovimenti = (data) => sbGet(`im_movimenti?select=*,righe:im_movimenti_righe(*)&order=data_movimento.desc,creato_il.desc${data ? `&data_movimento=eq.${data}` : ''}&limit=200`);

/** Registra un movimento da una causale (genera la prima nota bilanciata). */
export async function registraMovimento({ causaleCodice, importo, dataMovimento, dataContabile, descrizione, documento, societa, creatoDa }) {
  if (!causaleCodice) throw new Error('causaleCodice mancante');
  if (!(Number(importo) > 0)) throw new Error('importo non valido');
  const cs = await sbGet(`im_causali?select=id,codice,descrizione,righe:im_causali_righe(*)&codice=eq.${encodeURIComponent(causaleCodice)}`);
  const causale = cs[0];
  if (!causale) throw new Error(`causale ${causaleCodice} inesistente`);
  const { righe, sbilancio } = buildMovimentoRighe(causale.righe, importo);
  if (Math.abs(sbilancio) > 0.001) throw new Error(`causale ${causaleCodice} sbilanciata (${sbilancio})`);

  const mov = (await sbPost('im_movimenti', [{
    data_movimento: dataMovimento, data_contabile: dataContabile || dataMovimento,
    causale_id: causale.id, causale_codice: causale.codice,
    descrizione: descrizione || causale.descrizione, documento: documento || null,
    importo: r2(importo), societa: societa || 'WITH US', creato_da: creatoDa || null,
  }], { Prefer: 'return=representation' }))[0];

  await sbPost('im_movimenti_righe', righe.map((x) => ({ ...x, movimento_id: mov.id })));
  return { movimento: mov, righe };
}

/** Quadratura a una data (righe fino a data inclusa). */
export async function getQuadratura(data) {
  const pc = await getPianoConti();
  const filtro = data ? `&im_movimenti.data_movimento=lte.${data}` : '';
  const righe = await sbGet(`im_movimenti_righe?select=sottoconto,dare,avere,im_movimenti!inner(data_movimento)${filtro}`);
  return computeQuadratura(pc, righe);
}
