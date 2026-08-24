/* ═══════════════════════════════════════════════════════════════════════════
   VIAGGIO (HDI Viaggio Singolo) — il calcolo del premio, in un posto solo.

   Lo caricano il preventivatore nel browser e il backend. Prima erano
   vgComboPremio/vgPerPersona/vgTotale in index.html, che leggevano la globale
   VG_DATA; qui lo stato arriva come argomento.
   Parita' dimostrata in server/verifica/parita-tariffe.test.mjs.

   Dentro un contenitore: da <script src> una var di primo livello diventa
   globale della pagina e puo' spegnere l'intero preventivatore.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

var VG_AREE = [
  {key:'italia',     nome:'Italia',                          base:'Italia',      opt:'Italia_EU'},
  {key:'europa',     nome:'Europa',                          base:'EU',          opt:'Italia_EU'},
  {key:'mondo_ex',   nome:'Mondo (escluso USA e Canada)',    base:'WW_ex_USA',   opt:'WW_ex_USA'},
  {key:'mondo_incl', nome:'Mondo (incluso USA e Canada)',    base:'WW_incl_USA', opt:'WW_incl_USA'},
];
var VG_TAR = {
  base:{
    Large:{ Italia:[19,28,29,33,55,83], EU:[22,32,32,38,64,95], WW_ex_USA:[34,49,49,58,98,147], WW_incl_USA:[41,58,60,70,117,176], sett:{Italia:4,EU:5,WW_ex_USA:7,WW_incl_USA:10} },
    Medium:{ Italia:[17.28,25.46,26.37,30,50,75.46], EU:[20,29.10,29.09,34.54,58.18,86.37], WW_ex_USA:[30.91,44.55,44.55,52.73,89.09,133.63], WW_incl_USA:[37.28,52.72,54.54,63.64,106.36,160], sett:{Italia:3.63,EU:4.54,WW_ex_USA:6.37,WW_incl_USA:9.10} },
    Small:{ Italia:[16.52,24.35,25.22,28.69,47.83,72.17], EU:[19.13,27.83,27.83,33.05,55.65,82.61], WW_ex_USA:[29.57,42.61,42.61,50.43,85.22,127.83], WW_incl_USA:[35.66,50.44,52.18,60.86,101.74,153.04], sett:{Italia:3.48,EU:4.35,WW_ex_USA:6.08,WW_incl_USA:8.70} },
  },
  bagaglio:{
    Large:{ Italia_EU:[4,6,7,7,12,18], WW_ex_USA:[8,11,12,13,21,32], WW_incl_USA:[9,13,14,17,27,41], sett:{Italia_EU:1,WW_ex_USA:1,WW_incl_USA:2} },
    Medium:{ Italia_EU:[3.70,5.56,6.48,6.48,11.11,16.67], WW_ex_USA:[7.41,10.19,11.11,12.04,19.44,29.63], WW_incl_USA:[8.33,12.04,12.96,15.74,25.00,37.96], sett:{Italia_EU:0.93,WW_ex_USA:0.93,WW_incl_USA:1.85} },
    Small:{ Italia_EU:[3.57,5.36,6.25,6.25,10.71,16.07], WW_ex_USA:[7.14,9.82,10.71,11.61,18.75,28.57], WW_incl_USA:[8.04,11.61,12.50,15.18,24.11,36.61], sett:{Italia_EU:0.89,WW_ex_USA:0.89,WW_incl_USA:1.79} },
  },
  annullamento:{ Italia_EU:[26.40,37.60,40.00,44.80,73.60,112.00], WW_ex_USA:[37.60,56.00,62.40,67.20,112.00,168.00], WW_incl_USA:[46.40,67.20,73.60,82.40,138.40,205.60], sett:{Italia_EU:4.80,WW_ex_USA:4.80,WW_incl_USA:4.80} },
  rinuncia:{ Italia_EU:[3.30,4.70,5.00,5.60,9.20,14.00], WW_ex_USA:[4.70,7.00,7.80,8.40,14.00,21.00], WW_incl_USA:[5.80,8.40,9.20,10.30,17.30,25.70], sett:{Italia_EU:0.60,WW_ex_USA:0.60,WW_incl_USA:0.60} },
  interruzione:{ Italia_EU:[3.30,4.70,5.00,5.60,9.20,14.00], WW_ex_USA:[4.70,7.00,7.80,8.40,14.00,21.00], WW_incl_USA:[5.80,8.40,9.20,10.30,17.30,25.70], sett:{Italia_EU:0.60,WW_ex_USA:0.60,WW_incl_USA:0.60} },
};
function vgFasciaIdx(d){ if(d<=7)return 0; if(d<=14)return 1; if(d<=24)return 2; if(d<=31)return 3; if(d<=45)return 4; return 5; }
function vgComp(tbl, areaKey, days){ if(!tbl||!tbl[areaKey]||!days) return 0; const arr=tbl[areaKey], sett=(tbl.sett&&tbl.sett[areaKey])||0; if(days<=60) return arr[vgFasciaIdx(days)]; return arr[5] + Math.ceil((days-60)/7)*sett; }

function vgArea(d) { d = d || {}; return VG_AREE.find(a => a.key === d.dest) || VG_AREE[1]; }

/* I giorni si contano dalle due date, estremi inclusi: e' la regola della
   polizza, non un arrotondamento nostro. */
function vgGiorni(d) {
  d = d || {};
  const p = d.dataPartenza, r = d.dataRientro;
  if (!p || !r) return 0;
  const g = Math.round((new Date(r) - new Date(p)) / 86400000) + 1;
  return g > 0 ? g : 0;
}

function vgComboPremio(level, days, d) {
  if (!days) return 0;
  const a = vgArea(d);
  let p = vgComp(VG_TAR.base[level], a.base, days);
  p += vgComp(VG_TAR.bagaglio[level], a.opt, days);
  p += vgComp(VG_TAR.annullamento, a.opt, days);
  p += vgComp(VG_TAR.rinuncia, a.opt, days);
  p += vgComp(VG_TAR.interruzione, a.opt, days);
  return p;
}

function vgPerPersona(d) { const g = vgGiorni(d); return g ? vgComboPremio((d || {}).livello, g, d) : 0; }

/* d: lo stato del preventivo (dest, livello, dataPartenza, dataRientro,
   nAssicurati). */
function calcolaViaggio(d) { d = d || {}; return vgPerPersona(d) * (d.nAssicurati || 1); }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calcolaViaggio: calcolaViaggio, vgPerPersona: vgPerPersona,
                     vgComboPremio: vgComboPremio, vgGiorni: vgGiorni, vgArea: vgArea,
                     vgComp: vgComp, vgFasciaIdx: vgFasciaIdx, VG_AREE: VG_AREE, VG_TAR: VG_TAR };
}
if (typeof window !== 'undefined') {
  window.calcolaViaggio = calcolaViaggio;
  window.vgPerPersonaM = vgPerPersona; window.vgComboPremioM = vgComboPremio;
  window.vgGiorniM = vgGiorni; window.vgAreaM = vgArea;
  window.vgComp = vgComp; window.vgFasciaIdx = vgFasciaIdx;
  window.VG_AREE = VG_AREE; window.VG_TAR = VG_TAR;
}
})();
