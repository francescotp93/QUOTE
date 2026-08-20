/* ═══════════════════════════════════════════════════════════════════════════
   TUTELA LEGALE — il calcolo del premio, in un posto solo.

   Lo caricano DUE mondi: il preventivatore nel browser (<script src>) e il
   backend (require da Node). Un premio calcolato a schermo e uno calcolato
   dall'API sono lo stesso numero per costruzione: e' lo stesso file.

   DA DOVE ARRIVA. Prima era tlPremio() in index.html, che leggeva la variabile
   globale TL_DATA. Qui lo stato arriva come argomento: e' l'unica differenza,
   ed e' quella che permette al backend di chiamarlo. L'aritmetica e' invariata,
   e lo dimostra server/verifica/parita-tariffe.test.mjs confrontando i due su
   ogni combinazione di prodotto, massimale, intestatario e sconto.

   TUTTO DENTRO UN CONTENITORE: da <script src> una var di primo livello
   diventa globale della pagina, e una collisione di nome fa smettere di
   eseguire l'INTERO script del preventivatore. E' gia' successo con CAT_CAP.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

/* per massimale: PF veicolo / PF moto / PG <35 q.li / PG >35 q.li */
var TL_MYDRIVE = {
  10000: { pfV: 41, pfM: 31, pgMin: 49, pgMax: 64 },
  20000: { pfV: 51, pfM: 39, pgMin: 61, pgMax: 80 },
  30000: { pfV: 57, pfM: 43, pgMin: 69, pgMax: 90 },
  40000: { pfV: 62, pfM: 47, pgMin: 74, pgMax: 96 },
  50000: { pfV: 66, pfM: 50, pgMin: 78, pgMax: 102 },
};

function tlR2(x) { return Math.round(x * 100) / 100; }

/* d: lo stato del preventivo (prodotto, massimale, intestatario, mdTarga,
   mdQuintali, sconto15, mwFormula, mwPerdite, utFormula). Un prodotto
   sconosciuto vale 0, come prima: chi chiama decide se e' un errore. */
function calcolaTutelaLegale(d) {
  d = d || {};
  if (d.prodotto === 'mydrive') {
    const row = TL_MYDRIVE[d.massimale] || TL_MYDRIVE[10000];
    let base = d.intestatario === 'PG' ? (d.mdQuintali === 'max' ? row.pgMax : row.pgMin) : (d.mdTarga === 'moto' ? row.pfM : row.pfV);
    return d.sconto15 ? tlR2(base * 0.85) : base;
  }
  if (d.prodotto === 'myway') {
    let base = d.mwFormula === 'famiglia' ? 154 : 113;
    if (d.sconto15) base = tlR2(base * 0.85);
    return tlR2(base + (d.mwPerdite ? 11.50 : 0));
  }
  if (d.prodotto === 'utenze') { return d.utFormula === 'PLUS' ? 60 : 36; }
  return 0;
}

/* ── si consegna a chi lo carica, e niente di piu' ───────────────────────── */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calcolaTutelaLegale: calcolaTutelaLegale, tlR2: tlR2, TL_MYDRIVE: TL_MYDRIVE };
}
if (typeof window !== 'undefined') {
  window.calcolaTutelaLegale = calcolaTutelaLegale;
  window.tlR2 = tlR2;
  window.TL_MYDRIVE = TL_MYDRIVE;
}
})();
