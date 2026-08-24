/* ═══════════════════════════════════════════════════════════════════════════
   RC RISCHI DIVERSI — il calcolo del premio, in un posto solo.

   Lo caricano il preventivatore nel browser e il backend. Prima era
   rcrdPremio() in index.html e leggeva la globale RCRD_DATA; qui lo stato
   arriva come argomento, ed e' l'unica differenza.
   Parita' dimostrata in server/verifica/parita-tariffe.test.mjs.

   Dentro un contenitore: da <script src> una var di primo livello diventa
   globale della pagina e puo' spegnere l'intero preventivatore.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

var RCRD_MASSIMALI = [250000,500000,1000000,1500000,2000000,2500000,3000000,3500000,5000000];
var RCRD_ATTIVITA = [
  {key:'alb_somm', cod:'2.18.13', grp:'albergo', nome:'Alberghi, hotel, ostelli, B&B, villaggi, pensioni (con somministrazione cibi e bevande)', tassi:[3,3.6,3.75,3.9,4.05,4.2,4.35,4.5,4.8], rco:50},
  {key:'alb_res', cod:'2.18.19', grp:'albergo', nome:'Residence, affittacamere, "zimmer", bagni pubblici', tassi:[2,2.4,2.5,2.6,2.7,2.8,2.9,3,3.2], rco:20},
  {key:'alb_camp', cod:'2.18.23', grp:'albergo', nome:'Campeggi', tassi:[4,4.8,5,5.2,5.4,5.6,5.8,6,6.4], rco:20},
  {key:'balneari', cod:'2.32.11', grp:'lidi', nome:'Stabilimenti balneari', tassi:[0.45,0.54,0.56,0.59,0.61,0.63,0.65,0.68,0.72], rco:20},
];
var RCRD_ESTENSIONI = [
  {key:'animali', nome:'Animali', perc:50, desc:'Estende la RCT ai danni causati a terzi da animali detenuti nell\'ambito dell\'attività (es. animali ospitati o presenti in struttura).'},
  {key:'cose_clienti', nome:'Danni/RC a cose portate o consegnate dai clienti', perc:15, desc:'Copre danneggiamento, sottrazione o smarrimento delle cose (bagagli, effetti personali, beni) portate o consegnate dai clienti dell\'esercizio.'},
  {key:'infortuni_sub', nome:'Infortuni subappaltatori e loro dipendenti', perc:15, desc:'Estende la copertura agli infortuni subiti dai subappaltatori e dai loro dipendenti durante i lavori per conto dell\'assicurato.'},
  {key:'subappalto', nome:'Cessione di lavori in subappalto', perc:10, desc:'Copre la responsabilità dell\'assicurato per i lavori affidati in subappalto a imprese terze.'},
];

/* Premio minimo di polizza: sta dove sta il calcolo. */
var RCRD_MIN = 400;

function rcrdAtt(d) { d = d || {}; return RCRD_ATTIVITA.find(a => a.key === d.attivita) || RCRD_ATTIVITA[0]; }
function rcrdMassIdx(d) { d = d || {}; return RCRD_MASSIMALI.indexOf(d.massimale); }
function rcrdRctBase(d) { const a = rcrdAtt(d); const i = rcrdMassIdx(d); if (i < 0) return 0; return a.tassi[i] * ((d && d.fatturato) || 0) / 1000; }

/* d: lo stato del preventivo (attivita, massimale, fatturato, estensioni, rco). */
function calcolaRcRischiDiversi(d) {
  d = d || {};
  const a = rcrdAtt(d); const rct = rcrdRctBase(d);
  let perc = 0; RCRD_ESTENSIONI.forEach(e => { if ((d.estensioni || {})[e.key]) perc += e.perc; });
  if (d.rco) perc += a.rco;
  let p = rct * (1 + perc / 100);
  p = Math.floor(p);
  return Math.max(p, RCRD_MIN);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calcolaRcRischiDiversi: calcolaRcRischiDiversi, rcrdAtt: rcrdAtt,
                     rcrdMassIdx: rcrdMassIdx, rcrdRctBase: rcrdRctBase,
                     RCRD_ATTIVITA: RCRD_ATTIVITA, RCRD_MASSIMALI: RCRD_MASSIMALI,
                     RCRD_ESTENSIONI: RCRD_ESTENSIONI, RCRD_MIN: RCRD_MIN };
}
if (typeof window !== 'undefined') {
  window.calcolaRcRischiDiversi = calcolaRcRischiDiversi;
  window.rcrdAttM = rcrdAtt; window.rcrdMassIdxM = rcrdMassIdx; window.rcrdRctBaseM = rcrdRctBase;
  window.RCRD_ATTIVITA = RCRD_ATTIVITA; window.RCRD_MASSIMALI = RCRD_MASSIMALI;
  window.RCRD_ESTENSIONI = RCRD_ESTENSIONI; window.RCRD_MIN = RCRD_MIN;
}
})();
