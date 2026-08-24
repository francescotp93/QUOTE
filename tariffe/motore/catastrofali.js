/* ═══════════════════════════════════════════════════════════════════════════
   RISCHI CATASTROFALI — il calcolo del premio, in un posto solo.

   Questo file lo caricano DUE mondi: il preventivatore nel browser
   (<script src>) e il backend (require da Node). E' scritto per funzionare in
   entrambi senza compilazione: niente import/export, e in fondo si espone a
   chi lo sta caricando.

   IL CORPO DI calcCatPremio E' QUELLO DI index.html, SPOSTATO IDENTICO.
   Non e' pigrizia: e' l'unico modo di poter affermare che il premio non e'
   cambiato spostandosi. Una riscrittura «piu' pulita» di una tariffa non da'
   nessun errore quando sbaglia — emette una polizza a un prezzo storto, e lo
   si scopre da un cliente. Una prova confronta il vecchio e il nuovo su piu'
   di mille combinazioni: server/verifica/parita-catastrofali.test.mjs.

   La tariffa (CAP -> tassi) NON sta qui: si passa da fuori con
   caricaTariffa(). Nel browser la carica il preventivatore da
   tariffe/catastrofali_cap.json, sul server la carica l'adattatore dell'API.
   Cosi' il file dei tassi resta uno solo e questo modulo non sa da dove
   arrivi.

   TUTTO STA DENTRO UN CONTENITORE, e non e' un vezzo. Da <script src> ogni
   `var` di primo livello diventa una variabile globale della pagina: la prima
   versione di questo file dichiarava CAT_CAP fuori, e il preventivatore ne ha
   una sua con lo stesso nome. Risultato: «Identifier 'CAT_CAP' has already
   been declared», e l'INTERO script di index.html smetteva di essere eseguito
   — quotatore morto, non un pezzo mancante. Fuori esce solo cio' che serve.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

var CAT_CAP = null;
function caricaTariffa(dati) { CAT_CAP = dati || {}; return CAT_CAP; }

/* Premio minimo di polizza. Stava in index.html accanto al calcolo: si sposta
   con lui, perche' e' una costante di calcolo e le costanti di calcolo vivono
   dove vive il calcolo. */
var RCAB_PMIN = 60;

function calcCatPremio(cap, valore, opt){
  const t = (CAT_CAP||{})[String(cap).padStart(5,'0')];
  if (!t || !valore) return null;
  const [tTerr, tAllu] = t;
  const g = [];
  const pTerrFabb = tTerr*valore/1000; g.push({nome:'Terremoto · Fabbricato', somma:valore, premio:pTerrFabb});
  let pTerrCont=0; if(opt.terrCont){ pTerrCont=tTerr*(0.20*valore)/1000; g.push({nome:'Terremoto · Contenuto (20%)', somma:0.20*valore, premio:pTerrCont}); }
  let pAlluFabb=0; if(opt.alluFabb){ pAlluFabb=tAllu*valore/1000; g.push({nome:'Alluvione/Inondazione · Fabbricato', somma:valore, premio:pAlluFabb}); }
  let pAlluCont=0; if(opt.terrCont && opt.alluFabb && opt.alluCont){ pAlluCont=tAllu*(0.20*valore)/1000; g.push({nome:'Alluvione/Inondazione · Contenuto (20%)', somma:0.20*valore, premio:pAlluCont}); }
  let base = pTerrFabb+pTerrCont+pAlluFabb+pAlluCont;
  if (base < RCAB_PMIN) base = RCAB_PMIN;
  const baseFloor = Math.floor(base);
  let premio = baseFloor;                 // nessuna commissione, nessuna tutela legale/peritale
  let semestrale = null;
  if (opt.frazionamento === 'Semestrale' && baseFloor >= 120){ premio = premio*1.02; semestrale = premio/2; }
  return { garanzie:g, base, baseFloor, premio, semestrale, tassoTerr:tTerr, tassoAllu:tAllu };
}

/* ── si consegna a chi lo carica, e niente di piu' ───────────────────────── */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calcCatPremio: calcCatPremio, caricaTariffa: caricaTariffa, RCAB_PMIN: RCAB_PMIN };
}
if (typeof window !== 'undefined') {
  window.calcCatPremio = calcCatPremio;
  window.caricaTariffaCat = caricaTariffa;
  window.RCAB_PMIN = RCAB_PMIN;
}
})();
