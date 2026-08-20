/* ═══════════════════════════════════════════════════════════════════════════
   SALUTE / MALATTIA — Aglea Salus 2026 e Long Term Care.

   Il premio in un posto solo: lo leggono il preventivatore nel browser e il
   backend. Prima era salPremio() in index.html e leggeva la globale SAL_DATA;
   qui lo stato arriva come argomento, ed e' l'unica differenza.
   Parita' dimostrata in server/verifica/parita-tariffe.test.mjs.

   Dentro un contenitore: da <script src> una var di primo livello diventa
   globale della pagina e puo' spegnere l'intero preventivatore.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

var SAL_PRODOTTI = {
  attiva: { nome:'Attiva', etaMax:60, livelli:[
    {key:'base', nome:'Base',     single:900,  nucleo:1700, gar:'Maternità 5.000 €; interventi ambulatoriali 1.000 €; prevenzione 200 €; alta diagnostica 2.000 €; visite 1.000 €; ticket SSN 100%; odontoiatriche 1.500 €; LTC 3.000 € + 500 €/mese'},
    {key:'plus', nome:'Plus',     single:1460, nucleo:2600, gar:'Ricovero con intervento 100.000 €; maternità 5.000 €; alta diagnostica 2.000 €; visite 1.500 €; ticket SSN 100%; LTC 6.000 € + 500 €/mese'},
    {key:'plat', nome:'Platinum', single:2800, nucleo:5400, gar:'Ricovero con/senza intervento 200.000 €; grande intervento 400.000 €; maternità 4.000 €; alta diagnostica 5.000 €; visite 1.500 €; ticket SSN 100%; LTC 12.000 € + 1.000 €/mese'},
  ]},
  protezione: { nome:'Protezione', etaMax:70, livelli:[
    {key:'base', nome:'Base',     single:1300, nucleo:2500, gar:'Grande intervento chirurgico 100.000 €; interventi ambulatoriali 1.000 €; diagnostica/prevenzione 150 €; alta diagnostica 2.000 €; visite 1.000 €; ticket SSN 200 €; odontoiatriche da infortunio 1.500 €'},
    {key:'plus', nome:'Plus',     single:1800, nucleo:3500, gar:'Ricovero con intervento 100.000 €; alta diagnostica 2.500 €; visite 1.500 €; ticket SSN 250 €; odontoiatriche da infortunio 1.500 €'},
    {key:'plat', nome:'Platinum', single:2800, nucleo:5700, gar:'Ricovero con intervento 100.000 €; grande intervento 300.000 €; alta diagnostica 3.000 €; visite 2.000 €; ticket SSN 300 €'},
  ]},
  // ── Aglea Salus 2026 — prodotti nuovi (Aglea Medici, Salute 360, Senis Assistance) ──
  medici: { nome:'Aglea Medici', etaMax:99, upgrade:true, livelli:[
    {key:'std',    nome:'Standard', single:1150, nucleo:2200, up_single:450, up_nucleo:750,  gar:'Ricovero 100.000 €; grande intervento 200.000 €; intramoenia per classi; maternità 4.000 €; alta diagnostica 3.000 €; cure oncologiche 2.000 €; second opinion'},
    {key:'over60', nome:'Over 60',  single:1800, nucleo:3500, up_single:700, up_nucleo:1200, gar:'Stesse garanzie base Aglea Medici, tariffa dedicata agli over 60'},
  ]},
  salute360: { nome:'Salute 360', etaMax:50, livelli:[
    {key:'unico', nome:'Completo', single:1160, nucleo:1960, gar:'Grande intervento 70.000 €; ricovero 35.000 €; parto 3.000 €; interventi ambulatoriali 500 €; alta diagnostica 1.000 €; visite 500 €; assistenza gravi eventi 2.500 €'},
  ]},
  senis: { nome:'Senis Assistance', etaMax:80, soloSingle:true, livelli:[
    {key:'unico', nome:'2026', single:1950, nucleo:null, gar:'Ricovero con intervento 100.000 €; interventi ambulatoriali 500 €; cataratta con laser 700 €; 2 visite/alta diagnostica annue; assistenza infermieristica e domestica'},
  ]},
};
var SAL_LTC = [
  {key:'150', nome:'Long Term Care 150', premio:150, desc:'3.000 € subito + 500 €/mese a vita'},
  {key:'200', nome:'Long Term Care 200', premio:200, desc:'6.000 € subito + 500 €/mese a vita'},
  {key:'350', nome:'Long Term Care 350', premio:350, desc:'12.000 € subito + 1.000 €/mese a vita'},
];
var SAL_FRAZ = [
  {key:'annuale',     nome:'Annuale',     div:1},
  {key:'semestrale',  nome:'Semestrale',  div:2},
  {key:'trimestrale', nome:'Trimestrale', div:4},
  {key:'mensile',     nome:'Mensile',     div:12},
];

/* d: lo stato del preventivo (tipo, livello, comp, upgrade, ltc, fraz). */
function salLiv(d) {
  d = d || {};
  var p = SAL_PRODOTTI[d.tipo];
  return p ? (p.livelli.find(function (l) { return l.key === d.livello; }) || p.livelli[0]) : null;
}
function salLtc(d) {
  d = d || {};
  return SAL_LTC.find(function (x) { return x.key === d.ltc; }) || SAL_LTC[1];
}
function salEtaMax(d) {
  d = d || {};
  if (d.tipo === 'ltc') return 60;
  var p = SAL_PRODOTTI[d.tipo];
  return p ? p.etaMax : null;
}
function calcolaSalute(d) {
  d = d || {};
  if (d.tipo === 'ltc') return salLtc(d).premio;
  var l = salLiv(d);
  /* Nella pagina qui si sarebbe rotto tutto: un tipo che non esiste non
     arriva mai dal modulo a schermo, ma puo' arrivare dalla API. Meglio
     «non so quotare» che un errore cinquecento. */
  if (!l) return null;
  var p = d.comp === 'nucleo' ? l.nucleo : l.single;
  if (d.tipo === 'medici' && d.upgrade) p += (d.comp === 'nucleo' ? (l.up_nucleo || 0) : (l.up_single || 0));
  return p;
}
function salRata(d) {
  d = d || {};
  var f = SAL_FRAZ.find(function (x) { return x.key === d.fraz; }) || SAL_FRAZ[0];
  var p = calcolaSalute(d);
  return p == null ? null : p / f.div;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calcolaSalute: calcolaSalute, salRata: salRata, salLiv: salLiv,
                     salLtc: salLtc, salEtaMax: salEtaMax,
                     SAL_PRODOTTI: SAL_PRODOTTI, SAL_LTC: SAL_LTC, SAL_FRAZ: SAL_FRAZ };
}
if (typeof window !== 'undefined') {
  window.calcolaSalute = calcolaSalute;
  window.salRataM = salRata; window.salLivM = salLiv;
  window.salLtcM = salLtc; window.salEtaMaxM = salEtaMax;
  window.SAL_PRODOTTI = SAL_PRODOTTI; window.SAL_LTC = SAL_LTC; window.SAL_FRAZ = SAL_FRAZ;
}
})();
