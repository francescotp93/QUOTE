/* ═══════════════════════════════════════════════════════════════════════════
   AMTRUST — i calcoli dei premi, in un posto solo.

   Lo caricano DUE mondi: il preventivatore nel browser (<script src>) e il
   backend (require da Node). Un premio calcolato a schermo e uno calcolato
   dall'API sono lo stesso numero per costruzione: e' lo stesso file.

   AmTrust non e' un prodotto: sono 11 prodotti e CINQUE motori di calcolo
   (generale, pubblico impiego, specializzazione, combinazione, tasso). Escono
   dalla pagina uno alla volta, e ognuno arriva qui con la sua aritmetica
   SPOSTATA INVARIATA — non riscritta. Lo dimostra
   server/verifica/parita-amtrust.test.mjs, che confronta il premio del
   preventivatore di prima con quello di adesso su tutti e cinque i motori.

   Le funzioni prendono i dati gia' letti e la tariffa: non sanno niente di
   schermi. E' quello che permette al backend di usarle.

   TUTTO DENTRO UN CONTENITORE: da <script src> una var di primo livello
   diventa globale della pagina, e una collisione di nome fa smettere di
   eseguire l'INTERO script del preventivatore. E' gia' successo con CAT_CAP.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

var AMT_COP_LBL = { solo_colpa_grave: 'Solo Colpa Grave', responsabilita_civile_e_colpa_grave: 'RC + Colpa Grave' };

function amtComboList(prod, cop) { return (prod.combinazioni || []).filter(c => c.copertura === cop); }

/* ── COMBINAZIONE (farmacista) ─────────────────────────────────────────────
   dati: { copertura, indiceMassimale, retroIllimitata, garanzie: [indici] }
   Restituisce null quando la combinazione non e' quotabile: il preventivatore
   scrive «riservata alla Direzione», l'API risponde INVALID_INPUT. */
function calcolaCombo(prod, dati) {
  if (!prod || !dati || !dati.copertura) return null;
  const mi = dati.indiceMassimale;
  if (mi === '' || mi == null) return null;
  const list = amtComboList(prod, dati.copertura);
  const combo = list[+mi];
  const base = combo ? combo.premio_lordo : null;
  if (base == null) return null;
  let retroEur = 0; const rIll = (prod.retroattivita || []).find(r => r && r.tipo === 'illimitata');
  if (rIll && dati.retroIllimitata) retroEur = rIll.premio_aggiuntivo_lordo || 0;
  const garSel = [];
  const scelte = dati.garanzie || [];
  (prod.garanzie_aggiuntive || []).forEach((ga, i) => { if (scelte.indexOf(i) >= 0) garSel.push({ nome: ga.nome, premio: ga.premio_lordo }); });
  const garTot = garSel.reduce((s, x) => s + x.premio, 0);
  const totale = base + retroEur + garTot;
  return {
    copertura: dati.copertura, coperturaLbl: AMT_COP_LBL[dati.copertura] || dati.copertura,
    massSin: combo.massimale_per_sinistro, massPer: combo.massimale_per_periodo,
    base: base, retroIll: retroEur > 0, retroEur: retroEur, garanzie: garSel, totale: totale,
  };
}

/* ── SPECIALIZZAZIONE (medico, dentista) ───────────────────────────────────
   Gli helper prendono lo stato AMT come argomento invece di leggerlo da una
   variabile globale: e' l'unica differenza rispetto alla pagina, ed e' quella
   che permette al backend di chiamarli. L'aritmetica e' invariata. */
function amtSpecRows(prod, amt) {
  const rows = ((prod.rc_base || {})['10_anni']) || [];
  if (amt && amt.key === 'medico_protetto') { const area = amt.area || 'non_chirurgica'; return rows.filter(r => r.area === area); }
  return rows;
}

function amtSpecRetroEur(prod, amt) {
  const se = (prod.sezioni_extra || []).find(s => /illimitata/i.test(s.titolo || '')); const d = (se && se.dati) || {};
  if (amt && amt.key === 'medico_protetto') return (amt.area === 'chirurgica') ? d.aree_mediche_chirurgiche : d.aree_mediche_non_chirurgiche;
  return d.sovrappremio;
}

function amtCorr(prod) {
  const all = [...((prod.sconti || []).map(x => ({ desc: x.desc, pct: x.pct }))), ...((prod.aumenti || []).map(x => ({ desc: x.desc, pct: x.pct })))];
  const g = { franchigia: [], albo: [], highrisk: [], sinistri: [], tl: [], altro: [] };
  all.forEach((x, i) => {
    x.i = i; const d = x.desc || '';
    if (/tutela legale/i.test(d)) g.tl.push(x);
    else if (/iscrizione albo/i.test(d)) g.albo.push(x);
    else if (/high risk/i.test(d)) g.highrisk.push(x);
    else if (/franchigia|raddoppio|dimezzamento/i.test(d)) g.franchigia.push(x);
    else if (/sinistr/i.test(d)) g.sinistri.push(x);
    else g.altro.push(x);
  });
  return { all: all, g: g };
}

/* dati: { specializzazione, massimale, correzioni: [indici], retroIllimitata,
          garanzie: [indici] }.  amt: { key, area }. */
function calcolaSpec(prod, dati, amt) {
  if (!prod || !dati) return null;
  const specName = String(dati.specializzazione || '').trim();
  const mass = dati.massimale;
  const rows = amtSpecRows(prod, amt); const row = rows.find(r => r.specializzazione === specName);
  if (!specName || !row || !mass) return null;
  const base = row.p ? row.p[mass] : null;
  if (base == null) return null;
  const { all } = amtCorr(prod);
  let corrPct = 0; const corrLbl = [];
  (dati.correzioni || []).forEach(i => { const c = all[+i]; if (c) { corrPct += c.pct; corrLbl.push(c.desc); } });
  const premioRC = base * (1 + corrPct / 100);
  let retroEur = 0; if (dati.retroIllimitata) { retroEur = amtSpecRetroEur(prod, amt) || 0; }
  const garSel = [];
  const scelte = dati.garanzie || [];
  (prod.garanzie_aggiuntive || []).forEach((ga, i) => { if (scelte.indexOf(i) >= 0) garSel.push({ nome: ga.nome, premio: ga.premio }); });
  const garTot = garSel.reduce((s, x) => s + x.premio, 0);
  const totale = premioRC + retroEur + garTot;
  return { spec: specName, classe: row.classe, mass: mass, base: base, corrPct: corrPct, corrLbl: corrLbl,
           premioRC: premioRC, retroIll: retroEur > 0, retroEur: retroEur, garanzie: garSel, totale: totale };
}

/* ── si consegna a chi lo carica, e niente di piu' ───────────────────────── */
var api = { calcolaCombo: calcolaCombo, calcolaSpec: calcolaSpec, amtComboList: amtComboList,
            amtSpecRows: amtSpecRows, amtSpecRetroEur: amtSpecRetroEur, amtCorr: amtCorr, AMT_COP_LBL: AMT_COP_LBL };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') {
  window.calcolaAmtCombo = calcolaCombo;
  window.amtComboList = amtComboList;
  window.calcolaAmtSpec = calcolaSpec;
  window.amtSpecRowsM = amtSpecRows;
  window.amtSpecRetroEurM = amtSpecRetroEur;
  window.amtCorrM = amtCorr;
  window.AMT_COP_LBL = AMT_COP_LBL;
}
})();
