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

/* ── forma dei dati di tariffa (spostati invariati dalla pagina) ──────────
   amtGrid ora riceve prod e lo stato AMT invece di leggerli da variabili
   globali: e' l'unica differenza, ed e' quella che permette al backend di
   chiamarla. */
function amtGrid(prod, amt){
  amt = amt || {}; if(!prod) return {rows:[],massimali:[],retros:[],retro:null};
  if(amt.key==='ingegno_protetto'){
    const cat=(prod.categorie||[])[amt.cat||0]||{dati:{}};
    const retros=Object.keys(cat.dati||{});
    const retro=(amt.retro&&retros.includes(amt.retro))?amt.retro:retros[0];
    return {rows:(cat.dati||{})[retro]||[], massimali:prod.massimali||[], retro, retros, extraLbl:cat.nome};
  }
  if(amt.key==='professioni_intellettuali'){
    if(amt.sogg==='associato'){ const sz=(prod.sezioni_extra||[])[0]||{dati:{}}; return {rows:(sz.dati||{})['unica']||[], massimali:sz.massimali||[], retro:'unica', retros:['unica'], extraLbl:'Studio Associato / STP'}; }
    return {rows:(prod.rc_base||{})['unica']||[], massimali:prod.massimali||[], retro:'unica', retros:['unica'], extraLbl:'Avvocato singolo'};
  }
  const retros=prod.retroattivita||['unica'];
  const retro=(amt.retro&&retros.includes(amt.retro))?amt.retro:retros[0];
  const rb=prod.rc_base||{};
  return {rows:rb[retro]||rb['unica']||[], massimali:prod.massimali||[], retro, retros};
}

function amtFasciaUpper(f){ const nums=(String(f).match(/[\d.]+/g)||[]).map(x=>parseInt(x.replace(/\./g,''),10)).filter(n=>!isNaN(n)); return nums.length?Math.max.apply(null,nums):Infinity; }
function amtFasciaRow(righe,val){ for(const r of righe){ if(val<=amtFasciaUpper(r.fascia)) return r; } return righe[righe.length-1]; }

function amtProgressive(table,fatt,massBase){
  const rows=(table||[]).map(r=>({t:(r.t==null?Infinity:r.t),rate:r.p[massBase]})).sort((a,b)=>a.t-b.t);
  let prev=0,tot=0; const parts=[]; let maxFinite=0; let covered=false;
  for(const r of rows){ if(isFinite(r.t)) maxFinite=Math.max(maxFinite,r.t); const upper=r.t; const slice=Math.min(fatt,upper)-prev; if(slice>0){ tot+=slice*r.rate/1000; parts.push('€ '+amtNf(Math.round(slice))+' × '+String(r.rate).replace('.',',')+'‰'); } if(fatt<=upper){ covered=true; break; } prev=upper; }
  const over=!covered && fatt>maxFinite; // fatturato oltre l'ultimo scaglione finito
  return {premio:tot,dett:parts.join(' + '),over};
}

/* ── GENERALE (commercialista, ingegno, professioni intellettuali) ─────────
   dati: { massimale, valore, correzioni:[i], garanzie:[i], sez0, pg:[i], inf,
           tl:{on, massimale, sinistri, vertenze} }
   amt:  { key, cat, retro, sogg } */
function calcolaGen(prod, dati, amt) {
  if (!prod || !dati) return null;
  amt = amt || {};
  const grid = amtGrid(prod, amt);
  const mass = dati.massimale;
  const val = parseFloat(dati.valore) || 0;
  if (!mass || !val) return null;
  const turns = grid.rows.map(r => r.t).sort((a, b) => a - b);
  let band = turns.find(t => t >= val); let overflow = false;
  if (band == null) { band = turns[turns.length - 1]; overflow = true; }
  const row = grid.rows.find(r => r.t === band);
  const base = row && row.p ? row.p[mass] : null;
  if (base == null) return null;
  const { all, g } = amtCorr(prod);
  let corrPct = 0; const corrLbl = [];
  (dati.correzioni || []).forEach(i => { const c = all[+i]; if (c) { corrPct += c.pct; corrLbl.push(c.desc + ' (' + (c.pct > 0 ? '+' : '') + c.pct + '%)'); } });
  const premioRC = base * (1 + corrPct / 100);
  const garSel = [];
  const scelte = dati.garanzie || [];
  if (amt.key === 'commercialista_protetto' || amt.key === 'ingegno_protetto') {
    (prod.garanzie_aggiuntive || []).forEach((ga, i) => { if (scelte.indexOf(i) >= 0) garSel.push({ nome: ga.nome, premio: ga.premio }); });
    if (amt.key === 'commercialista_protetto' && dati.sez0) {
      const sz = (prod.sezioni_extra || [])[0]; const rows = (sz && sz.dati ? sz.dati[grid.retro] : null) || [];
      const t2 = rows.map(r => r.t).sort((a, b) => a - b); let b2 = t2.find(t => t >= val); if (b2 == null) b2 = t2[t2.length - 1];
      const r2 = rows.find(r => r.t === b2); const pr = r2 && r2.p ? r2.p[mass] : null;
      if (pr != null) garSel.push({ nome: 'Estensione Sindaco/Revisore/CdA/OdV', premio: pr });
      else garSel.push({ nome: 'Estensione Sindaco/Revisore/CdA/OdV — non disponibile per questa combinazione', premio: 0 });
    }
  }
  if (amt.key === 'professioni_intellettuali') {
    const sz = (prod.sezioni_extra || [])[amt.sogg === 'associato' ? 2 : 1]; const keys = (sz && sz.massimali) || []; const rows = (sz && sz.dati ? sz.dati['unica'] : null) || [];
    const t2 = rows.map(r => r.t).sort((a, b) => a - b); let b2 = t2.find(t => t >= val); if (b2 == null) b2 = t2[t2.length - 1];
    const r2 = rows.find(r => r.t === b2);
    const pg = dati.pg || [];
    keys.forEach((k, i) => { if (pg.indexOf(i) >= 0) { const pr = r2 && r2.p ? r2.p[k] : null; if (pr != null) garSel.push({ nome: k, premio: pr }); } });
    const inf = (prod.sezioni_extra || [])[3]; const infV = dati.inf;
    if (inf && inf.dati && infV !== '' && infV != null) { const o = inf.dati[+infV]; if (o) garSel.push({ nome: o.opzione, premio: o.totale }); }
  }
  let tlPremio = 0, tlDett = null;
  const tl = prod.tutela_legale;
  const dtl = dati.tl || {};
  if (tl && tl.massimali && dtl.on) {
    const tlMass = dtl.massimale;
    if (tlMass) {
      const trow = amtFasciaRow(tl.righe || [], val); const tlBase = trow && trow.p ? trow.p[tlMass] : null;
      if (tlBase != null) {
        let tlPct = 0; const sinV = dtl.sinistri; if (sinV !== '' && sinV != null) { const c = all[+sinV]; if (c) tlPct += c.pct; }
        const tlRC = tlBase * (1 + tlPct / 100);
        let vert = 0; if (dtl.vertenze && tl.vertenze_passive) { const vi = (tl.righe || []).indexOf(trow); vert = ((tl.vertenze_passive[vi] != null) ? tl.vertenze_passive[vi] : 0) || 0; }
        tlPremio = tlRC + vert; tlDett = { mass: tlMass, fascia: trow.fascia, base: tlBase, pct: tlPct, vert: vert };
      } else { tlDett = { mass: tlMass, unavailable: true }; }
    }
  }
  const garTot = garSel.reduce((s, x) => s + x.premio, 0);
  const totale = premioRC + garTot + tlPremio;
  return { grid: grid, mass: mass, variabile: val, band: band, overflow: overflow, base: base,
           corrPct: corrPct, corrLbl: corrLbl, premioRC: premioRC, garanzie: garSel,
           tlPremio: tlPremio, tlDett: tlDett, totale: totale };
}


/* ── PUBBLICO IMPIEGO ──────────────────────────────────────────────────────
   dati: { fascia, massimale, a1, aOpzioni:[i], variazione,
           b:{on, tipo, b1, b2, opzioni:[i]}, c } */
function calcolaPi(prod, dati) {
  if (!prod || !dati) return null;
  const S = prod.sezioni || {};
  const fascia = dati.fascia, mass = dati.massimale;
  if (!fascia || !mass) return null;
  const A = S.A_responsabilita_amministrativa || { righe: [] };
  const arow = (A.righe || []).find(r => r.fascia === fascia);
  const aBase = arow && arow.p ? arow.p[mass] : null;
  if (aBase == null) return null;
  let a1 = 0; if (dati.a1) { const v = ((S.A1_estensione_danni_materiali || { valori: [] }).valori.find(x => x.fascia === fascia) || {}); a1 = v.importo || 0; }
  const aAA = aBase + a1;
  let apct = 0; const albl = [];
  const aOpz = dati.aOpzioni || [];
  (S.A_opzioni || []).forEach((o, i) => { if (aOpz.indexOf(i) >= 0) { apct += o.pct; albl.push(o.desc + ' (' + (o.pct > 0 ? '+' : '') + o.pct + '%)'); } });
  const varSel = dati.variazione; if (varSel !== '' && varSel != null) { const v = (S.A_variazioni_per_ente || [])[+varSel]; if (v) { apct += v.pct; albl.push(v.desc + ' (' + (v.pct > 0 ? '+' : '') + v.pct + '%)'); } }
  const premioA = aAA * (1 + apct / 100);
  let premioB = 0, bDett = null;
  const db = dati.b || {};
  if (db.on) {
    const B = S.B_tutela_legale || { righe: [] }; const tipo = db.tipo;
    const brow = (B.righe || []).find(r => r.fascia === fascia); const bBase = brow && brow.p ? brow.p[tipo] : null;
    if (bBase != null) {
      let b1 = 0; if (db.b1) { const B1r = ((S.B1_eliminazione_franchigia || { righe: [] }).righe.find(r => r.fascia === fascia)); b1 = (B1r && B1r.p ? B1r.p[tipo] : 0) || 0; }
      let b2 = 0; if (db.b2 && b1 > 0) { const v = ((S.B2_vertenze || { valori: [] }).valori.find(x => x.fascia === fascia) || {}); b2 = v.importo || 0; }
      let bpct = 0; const bOpz = db.opzioni || [];
      (S.B_opzioni || []).forEach((o, i) => { if (bOpz.indexOf(i) >= 0) bpct += o.pct; });
      premioB = (bBase + b1) * (1 + bpct / 100) + b2; bDett = { tipo: tipo, base: bBase, b1: b1, b2: b2, bpct: bpct };
    } else { bDett = { unavailable: true }; }
  }
  let premioC = 0; if (dati.c) { premioC = ((S.C_infortuni || { garanzie: [] }).garanzie || []).reduce((s, x) => s + x.premio, 0); }
  const totale = premioA + premioB + premioC;
  return { fascia: fascia, mass: mass, aBase: aBase, a1: a1, aAA: aAA, apct: apct, albl: albl,
           premioA: premioA, premioB: premioB, bDett: bDett, premioC: premioC, totale: totale };
}

/* ── formattatori usati DENTRO il calcolo ──────────────────────────────────
   Non sono presentazione accessoria: costruiscono le etichette che il calcolo
   restituisce (calcDett, corrLbl), quindi devono stare qui o il calcolo non si
   puo' spostare invariato. amtMoney nella pagina ripiegava su esc() per i
   valori non numerici; qui la fuga e' equivalente e non dipende dal browser. */
function amtNf(n) { return Number(n).toLocaleString('it-IT'); }
function amtPct(n) { return (n > 0 ? '+' : '') + String(n).replace('.', ',') + '%'; }
function amtFuga(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function amtMoney(m) { const n = Number(String(m).replace(/[^\d]/g, '')); return isFinite(n) && n ? ('€ ' + n.toLocaleString('it-IT')) : amtFuga(m); }

/* ── TASSO / PER-UNITA' (studi dentistici, poliambulatori, residenze, farmacie)
   dati: { massimale, valore, postiLetto:[], colonna, retroIllimitata,
           aumenti:[i], franchigia, sconti:[i], garanzie:[i] } */
function calcolaRate(prod, dati, amt) {
  if (!prod || !dati) return null;
  amt = amt || {};
  const massBase=prod.massimale_base;
  const mass=dati.massimale;
  if(!mass) return null;
  let base=0, calcDett='', overflow=false, varDesc='';
  if(amt.key==='residenze_sanitarie'){
    const rows=((prod.rc_base||{}).unica)||[]; let tot=0; const parts=[]; let anyN=0;
    rows.forEach((r,i)=>{ const n=parseInt((dati.postiLetto||[])[i])||0; anyN+=n; if(n>0){ const eur=r.p[massBase]||0; tot+=n*eur; parts.push(n+' × € '+amtNf(eur)); } });
    if(anyN<=0) return null;
    base=tot; calcDett=parts.join(' + '); varDesc=anyN+' posti letto';
  } else if(amt.key==='farmacie'){
    const n=parseInt(dati.valore)||0;
    if(n<=0) return null;
    const rows=((prod.rc_base||{}).unica||[]).slice().sort((a,b)=>a.t-b.t);
    const row=rows.find(r=>n<=r.t);
    if(row){ base=row.p[massBase]||0; calcDett='Fino a '+row.t+' addetti: € '+amtNf(base); }
    else { const last=rows[rows.length-1]; const lb=last.p[massBase]||0; const extra=n-last.t; const sup=(prod.garanzie_aggiuntive||[]).find(g=>/addetto supplementare/i.test(g.nome||''))||{premio:0}; base=lb+extra*(sup.premio||0); calcDett='€ '+amtNf(lb)+' (fino a '+last.t+') + '+extra+' × € '+String(sup.premio).replace('.',',')+' (addetti oltre l\'8º)'; }
    varDesc=n+' addetti';
  } else {
    const fatt=parseFloat(dati.valore)||0;
    if(fatt<=0) return null;
    let table=(prod.rc_base||{}).unica, col='unica';
    if(amt.key==='poliambulatori'){ col=dati.colonna||'base'; table=(prod.rc_base||{})[col]; }
    const pr=amtProgressive(table,fatt,massBase); base=pr.premio; calcDett=pr.dett; overflow=pr.over;
    varDesc='Fatturato € '+amtNf(fatt)+(amt.key==='poliambulatori'?(' · tariffa '+(col==='radiologia_ginecologia'?'Radiologia/Ginecologia':'Base')):'');
  }
  // Premio minimo di tariffa (applicato alla base prima delle correzioni %)
  let minApplied=false;
  if(prod.premio_minimo_lordo && base<prod.premio_minimo_lordo){ base=prod.premio_minimo_lordo; minApplied=true; }
  // Correzioni percentuali (additive, coerenti con la prima ondata)
  let corrPct=0; const corrLbl=[];
  (prod.aumenti||[]).forEach(a=>{ if(a.massimale && String(a.massimale)===String(mass)){ corrPct+=a.percentuale; corrLbl.push('Massimale '+amtMoney(mass)+' ('+amtPct(a.percentuale)+')'); } });
  if(dati.retroIllimitata){ const a=(prod.aumenti||[]).find(x=>/illimitata/i.test(x.nome||'')); if(a){ corrPct+=a.percentuale; corrLbl.push('Retroattività illimitata ('+amtPct(a.percentuale)+')'); } }
  (prod.aumenti||[]).forEach((a,i)=>{ if(!a.massimale && !/illimitata/i.test(a.nome||'') && (dati.aumenti||[]).indexOf(i)>=0){ corrPct+=a.percentuale; corrLbl.push(a.nome+' ('+amtPct(a.percentuale)+')'); } });
  const frq=dati.franchigia; if(frq!==''&&frq!=null){ const s=(prod.sconti||[])[+frq]; if(s){ corrPct+=s.percentuale; corrLbl.push('Franchigia € '+amtNf(s.franchigia)+' ('+amtPct(s.percentuale)+')'); } }
  (prod.sconti||[]).forEach((s,i)=>{ if(s.franchigia==null && (dati.sconti||[]).indexOf(i)>=0){ corrPct+=s.percentuale; corrLbl.push(s.nome+' ('+amtPct(s.percentuale)+')'); } });
  const premioRC=base*(1+corrPct/100);
  // Garanzie aggiuntive a percentuale sul premio RC
  const garSel=[];
  (prod.garanzie_aggiuntive||[]).forEach((g,i)=>{ if(g.percentuale!=null && !/addetto supplementare/i.test(g.nome||'') && (dati.garanzie||[]).indexOf(i)>=0){ garSel.push({nome:g.nome,premio:premioRC*g.percentuale/100,pct:g.percentuale}); } });
  const garTot=garSel.reduce((s,x)=>s+x.premio,0);
  const totale=premioRC+garTot;
  return { mass: mass, varDesc: varDesc, base: base, minApplied: minApplied, calcDett: calcDett,
           corrPct: corrPct, corrLbl: corrLbl, premioRC: premioRC, garanzie: garSel, totale: totale, overflow: overflow };
}

/* ── si consegna a chi lo carica, e niente di piu' ───────────────────────── */
var api = { calcolaCombo: calcolaCombo, calcolaSpec: calcolaSpec, calcolaGen: calcolaGen, calcolaPi: calcolaPi, calcolaRate: calcolaRate, amtNf: amtNf, amtPct: amtPct, amtMoney: amtMoney, amtGrid: amtGrid, amtFasciaRow: amtFasciaRow, amtFasciaUpper: amtFasciaUpper, amtProgressive: amtProgressive, amtComboList: amtComboList,
            amtSpecRows: amtSpecRows, amtSpecRetroEur: amtSpecRetroEur, amtCorr: amtCorr, AMT_COP_LBL: AMT_COP_LBL };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') {
  window.calcolaAmtCombo = calcolaCombo;
  window.amtComboList = amtComboList;
  window.calcolaAmtSpec = calcolaSpec;
  window.calcolaAmtGen = calcolaGen;
  window.calcolaAmtPi = calcolaPi;
  window.calcolaAmtRate = calcolaRate;
  window.amtNf = amtNf;
  window.amtPct = amtPct;
  window.amtMoney = amtMoney;
  window.amtGridM = amtGrid;
  window.amtFasciaRow = amtFasciaRow;
  window.amtFasciaUpper = amtFasciaUpper;
  window.amtProgressive = amtProgressive;
  window.amtSpecRowsM = amtSpecRows;
  window.amtSpecRetroEurM = amtSpecRetroEur;
  window.amtCorrM = amtCorr;
  window.AMT_COP_LBL = AMT_COP_LBL;
}
})();
