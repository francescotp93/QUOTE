/**
 * IAM — Contabilità dell'intermediario (nucleo partita doppia).
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

export const getPianoConti = () => sbGet('iam_piano_conti?select=*&attivo=eq.true&order=codice');
export const getCausali = () => sbGet('iam_causali?select=*,righe:iam_causali_righe(*)&attivo=eq.true&order=codice');
export const listMovimenti = (data) => sbGet(`iam_movimenti?select=*,righe:iam_movimenti_righe(*)&order=data_movimento.desc,creato_il.desc${data ? `&data_movimento=eq.${data}` : ''}&limit=200`);

/** Registra un movimento da una causale (genera la prima nota bilanciata). */
export async function registraMovimento({ causaleCodice, importo, dataMovimento, dataContabile, descrizione, documento, societa, creatoDa }) {
  if (!causaleCodice) throw new Error('causaleCodice mancante');
  if (!(Number(importo) > 0)) throw new Error('importo non valido');
  const cs = await sbGet(`iam_causali?select=id,codice,descrizione,righe:iam_causali_righe(*)&codice=eq.${encodeURIComponent(causaleCodice)}`);
  const causale = cs[0];
  if (!causale) throw new Error(`causale ${causaleCodice} inesistente`);
  const { righe, sbilancio } = buildMovimentoRighe(causale.righe, importo);
  if (Math.abs(sbilancio) > 0.001) throw new Error(`causale ${causaleCodice} sbilanciata (${sbilancio})`);

  const mov = (await sbPost('iam_movimenti', [{
    data_movimento: dataMovimento, data_contabile: dataContabile || dataMovimento,
    causale_id: causale.id, causale_codice: causale.codice,
    descrizione: descrizione || causale.descrizione, documento: documento || null,
    importo: r2(importo), societa: societa || 'WITH US', creato_da: creatoDa || null,
  }], { Prefer: 'return=representation' }))[0];

  await sbPost('iam_movimenti_righe', righe.map((x) => ({ ...x, movimento_id: mov.id })));
  return { movimento: mov, righe };
}

/** Quadratura a una data (righe fino a data inclusa). */
export async function getQuadratura(data) {
  const pc = await getPianoConti();
  const filtro = data ? `&iam_movimenti.data_movimento=lte.${data}` : '';
  const righe = await sbGet(`iam_movimenti_righe?select=sottoconto,dare,avere,iam_movimenti!inner(data_movimento)${filtro}`);
  return computeQuadratura(pc, righe);
}

// ───────── Incasso -> prima nota (ponte SSF/portafoglio -> contabilità) ─────────
// mezzo pagamento (decodificato SSF) -> sottoconto finanziario
const MEZZOPAG_SC = { carta: '06020001', bonifico: '06020001', contanti: '06010001', rid_sdd: '06020001', assegno: '06010002', altro: '06010001', sospeso: '04010001' };

/**
 * Righe di prima nota per un incasso premio (pura, bilanciata).
 *  D cassa/banca lordo / A saldo compagnia lordo
 *  D saldo compagnia provv / A provvigioni attive provv  (la provvigione riduce il debito v/compagnia)
 */
export function buildIncassoRighe({ lordo, provvigioni = 0, mezzoPag = 'contanti', saldoCompagnia = '41010000' }) {
  const L = r2(lordo), P = r2(provvigioni || 0);
  const scFin = MEZZOPAG_SC[mezzoPag] || '06010001';
  const righe = [
    { sottoconto: scFin, dare: L, avere: 0, descrizione: 'Incasso premio' },
    { sottoconto: saldoCompagnia, dare: 0, avere: L, descrizione: 'Debito compagnia' },
  ];
  if (P > 0) {
    righe.push({ sottoconto: saldoCompagnia, dare: P, avere: 0, descrizione: 'Provvigioni (credito v/compagnia)' });
    righe.push({ sottoconto: '71010000', dare: 0, avere: P, descrizione: 'Provvigioni attive' });
  }
  const tD = r2(righe.reduce((s, x) => s + x.dare, 0));
  const tA = r2(righe.reduce((s, x) => s + x.avere, 0));
  return { righe, totaleDare: tD, totaleAvere: tA, sbilancio: r2(tD - tA) };
}

/** Registra un incasso come prima nota (movimento 'INC'). */
export async function registraIncasso({ lordo, provvigioni, mezzoPag, dataMovimento, descrizione, numeroPolizza, saldoCompagnia, creatoDa }) {
  const { righe, sbilancio } = buildIncassoRighe({ lordo, provvigioni, mezzoPag, saldoCompagnia });
  if (Math.abs(sbilancio) > 0.001) throw new Error(`incasso sbilanciato (${sbilancio})`);
  const mov = (await sbPost('iam_movimenti', [{
    data_movimento: dataMovimento, data_contabile: dataMovimento, causale_codice: 'INC',
    descrizione: descrizione || ('Incasso ' + (numeroPolizza || '')), importo: r2(lordo),
    societa: 'WITH US', creato_da: creatoDa || null,
  }], { Prefer: 'return=representation' }))[0];
  await sbPost('iam_movimenti_righe', righe.map((x) => ({ ...x, movimento_id: mov.id })));
  return { movimento: mov, righe };
}

// ───────── Sospesi (scadenzario crediti) ─────────
export const listSospesi = (stato) => sbGet(`iam_sospesi?select=*&order=data_generazione.desc${stato ? `&stato=eq.${stato}` : ''}&limit=500`);

export async function creaSospeso({ importo, dataGenerazione, cliente, anagraficaId, polizza, compagnia, produttore, tipoSospeso, fido, note, creatoDa }) {
  if (!(Number(importo) > 0)) throw new Error('importo non valido');
  const row = {
    importo: r2(importo), data_generazione: dataGenerazione, cliente: cliente || null, anagrafica_id: anagraficaId || null,
    polizza: polizza || null, compagnia: compagnia || null, produttore: produttore || null,
    tipo_sospeso: tipoSospeso || '04010001', fido: fido != null ? r2(fido) : null, note: note || null,
    stato: 'aperto', creato_da: creatoDa || null,
  };
  return (await sbPost('iam_sospesi', [row], { Prefer: 'return=representation' }))[0];
}

/** Incassa (anche parzialmente) un sospeso: genera il movimento e aggiorna lo stato. */
export async function incassaSospeso({ id, importo, mezzoPag = 'contanti', dataIncasso, creatoDa }) {
  const cur = (await sbGet(`iam_sospesi?select=*&id=eq.${id}`))[0];
  if (!cur) throw new Error('sospeso inesistente');
  const gia = Number(cur.importo_incassato || 0), totale = Number(cur.importo);
  const quota = r2(importo != null ? importo : (totale - gia));
  if (quota <= 0 || gia + quota > totale + 0.001) throw new Error('quota incasso non valida');
  const scFin = MEZZOPAG_SC[mezzoPag] || '06010001';
  const mov = (await sbPost('iam_movimenti', [{
    data_movimento: dataIncasso, data_contabile: dataIncasso, causale_codice: 'RSO',
    descrizione: 'Recupero sospeso', importo: quota, societa: 'WITH US', creato_da: creatoDa || null,
  }], { Prefer: 'return=representation' }))[0];
  await sbPost('iam_movimenti_righe', [
    { movimento_id: mov.id, sottoconto: scFin, dare: quota, avere: 0, descrizione: 'Recupero sospeso' },
    { movimento_id: mov.id, sottoconto: cur.tipo_sospeso || '04010001', dare: 0, avere: quota, descrizione: 'Chiusura sospeso' },
  ]);
  const nuovoInc = r2(gia + quota);
  const nuovoStato = nuovoInc >= totale - 0.001 ? 'chiuso' : 'parziale';
  await fetch(`${SB_URL}/rest/v1/iam_sospesi?id=eq.${id}`, {
    method: 'PATCH', headers: sbHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ importo_incassato: nuovoInc, stato: nuovoStato, data_incasso: nuovoStato === 'chiuso' ? dataIncasso : cur.data_incasso }),
  });
  return { id, incassato: nuovoInc, stato: nuovoStato, movimento: mov };
}

// ───────── Estratto conto verso compagnia (aggregazione saldo 4101 nel periodo) ─────────
export async function estrattoContoCompagnia({ dal, al } = {}) {
  let q = 'iam_movimenti_righe?select=sottoconto,dare,avere,iam_movimenti!inner(data_movimento)&sottoconto=like.4101*';
  if (dal) q += `&iam_movimenti.data_movimento=gte.${dal}`;
  if (al) q += `&iam_movimenti.data_movimento=lte.${al}`;
  const righe = await sbGet(q);
  const per = {};
  for (const r of righe) { const k = r.sottoconto; per[k] = r2((per[k] || 0) + Number(r.avere || 0) - Number(r.dare || 0)); }
  const voci = Object.entries(per).map(([sottoconto, saldoDaVersare]) => ({ sottoconto, saldoDaVersare }));
  const totale = r2(voci.reduce((s, v) => s + v.saldoDaVersare, 0));
  return { periodo: { dal: dal || null, al: al || null }, voci, totaleDaVersare: totale };
}
