/* ═══════════════════════════════════════════════════════════════════════════
   RC PROFESSIONALE · PROFESSIONI NON REGOLAMENTATE — il calcolo, in un posto solo.

   Lo caricano DUE mondi: il preventivatore nel browser (<script src>) e il
   backend (require da Node). Un premio calcolato a schermo e uno calcolato
   dall'API sono lo stesso numero per costruzione: e' lo stesso file.

   DA DOVE ARRIVA. Prima stava dentro rcpComputeNR() in index.html, mescolato
   alla lettura dei campi e alla scrittura dell'HTML. E' stato separato in tre —
   leggi il modulo, calcola, disegna — e qui c'e' solo la meta' che calcola.
   Le righe di aritmetica sono quelle di prima, spostate invariate: una
   riscrittura «piu' pulita» di una tariffa non da' nessun errore quando
   sbaglia, da' una polizza a un prezzo storto. Lo dimostra
   server/verifica/parita-rcnonreg.test.mjs, che confronta questo calcolo con
   quello della pagina di prima su tutte le combinazioni della tariffa.

   TUTTO DENTRO UN CONTENITORE: da <script src> ogni var di primo livello
   diventa globale della pagina, e una collisione di nome fa smettere di
   eseguire l'INTERO script del preventivatore. E' gia' successo con CAT_CAP.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

/* netto x1,10 (caricamento) x1,2225 (imposte 22,25%) — le costanti stanno
   dove sta il calcolo, che e' la regola non negoziabile. */
var RC_LOAD = 1.10, RC_IMPOSTE = 1.2225;

function rcLordo(netto, flag10) { let l = netto * RC_LOAD * RC_IMPOSTE; if (flag10) l *= 1.10; return l; }

/* Dati: { categoria, fatturato, massimale }. Tariffa: il contenuto di
   tariffe/rc_non_regolamentate.json.
   Restituisce null quando la combinazione non e' quotabile — categoria
   sconosciuta, dati mancanti, oppure massimale non previsto per quella fascia.
   Chi chiama decide come dirlo: la pagina scrive un avviso, l'API risponde
   INVALID_INPUT. Il calcolo non sa niente di schermi ne' di codici HTTP. */
function calcolaRcNonReg(dati, tariffa) {
  var cat = ((tariffa || {}).categorie || {})[dati && dati.categoria];
  var fatt = parseFloat(dati && dati.fatturato) || 0;
  var mass = dati && dati.massimale;
  if (!cat || !fatt || !mass) return null;
  const turns = cat.righe.map(r => r.t).sort((a, b) => a - b);
  let band = turns.find(t => t >= fatt); let overflow = false;
  if (band == null) { band = turns[turns.length - 1]; overflow = true; }
  const row = cat.righe.find(r => r.t === band);
  const netto = row && row.p ? row.p[mass] : null;
  if (netto == null) return null;
  const lordo = rcLordo(netto, cat.flag10);
  return { netto: netto, lordo: lordo, mass: mass, band: band, fatt: fatt, flag10: !!cat.flag10, overflow: overflow };
}

/* ── si consegna a chi lo carica, e niente di piu' ───────────────────────── */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calcolaRcNonReg: calcolaRcNonReg, rcLordo: rcLordo, RC_LOAD: RC_LOAD, RC_IMPOSTE: RC_IMPOSTE };
}
if (typeof window !== 'undefined') {
  window.calcolaRcNonReg = calcolaRcNonReg;
  window.rcLordo = rcLordo;
  window.RC_LOAD = RC_LOAD;
  window.RC_IMPOSTE = RC_IMPOSTE;
}
})();
