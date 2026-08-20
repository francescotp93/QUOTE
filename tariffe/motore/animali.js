/* ═══════════════════════════════════════════════════════════════════════════
   ANIMALI DOMESTICI (Dottorpet) — il calcolo del premio, in un posto solo.

   Lo caricano il preventivatore nel browser e il backend: stesso file, stesso
   numero. Prima era petTotal() in index.html e leggeva la globale PET_DATA;
   qui lo stato arriva come argomento, ed e' l'unica differenza.
   Parita' dimostrata in server/verifica/parita-tariffe.test.mjs.

   Dentro un contenitore: da <script src> una var di primo livello diventa
   globale della pagina e puo' spegnere l'intero preventivatore.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

var PET_TIPI = [
  {key:'cane',     nome:'Cane',     icon:'ti-dog'},
  {key:'gatto',    nome:'Gatto',    icon:'ti-cat'},
  {key:'coniglio', nome:'Coniglio', icon:'ti-paw'},
];
var PET_PACCHETTI = [
  {key:'silver',   nome:'Silver',   premio:95},
  {key:'gold',     nome:'Gold',     premio:129},
  {key:'platinum', nome:'Platinum', premio:240},
  {key:'diamond',  nome:'Diamond',  premio:360},
];
var PET_RC = {premio:50, persone:'150.000 € — scoperto 10%, minimo 500 €', cose:'10.000 € — scoperto 10%, minimo 500 €'};

function petPack(d) { d = d || {}; return PET_PACCHETTI.find(p => p.key === d.pacchetto) || PET_PACCHETTI[2]; }
function petTipo(d) { d = d || {}; return PET_TIPI.find(t => t.key === d.tipo) || PET_TIPI[0]; }

/* d: lo stato del preventivo (tipo, pacchetto, rc). */
function calcolaAnimali(d) { d = d || {}; return petPack(d).premio + (d.rc ? PET_RC.premio : 0); }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calcolaAnimali: calcolaAnimali, petPack: petPack, petTipo: petTipo,
                     PET_TIPI: PET_TIPI, PET_PACCHETTI: PET_PACCHETTI, PET_RC: PET_RC };
}
if (typeof window !== 'undefined') {
  window.calcolaAnimali = calcolaAnimali;
  window.petPackM = petPack; window.petTipoM = petTipo;
  window.PET_TIPI = PET_TIPI; window.PET_PACCHETTI = PET_PACCHETTI; window.PET_RC = PET_RC;
}
})();
