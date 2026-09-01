/* ═══════════════════════════════════════════════════════════════════════════
   PREVIDENZA — il calcolo TFR e fondo pensione, in un posto solo.

   Come gli altri motori di questa cartella, il file lo caricano DUE mondi: la
   pagina nel browser (<script src>) e Node (require) per le prove. Niente
   import/export, niente compilazione: in fondo si espone a chi lo carica.

   ── DA DOVE VIENE ────────────────────────────────────────────────────────
   Il corpo di `pianoAzienda` e' quello di `buildPIVATable` del progetto Lab
   (lab-insurance-marketing), spostato senza cambiare un'operazione. Non e'
   pigrizia: e' l'unico modo di poter affermare che i numeri non sono cambiati
   spostandosi. Una riscrittura «piu' pulita» di un calcolo non da' nessun
   errore quando sbaglia — produce un preventivo storto che finisce in mano a
   un cliente. La prova di parita' rifa' il conto con la formula vecchia e
   confronta: server/verifica/parita-previdenza.test.mjs.

   ── TRE COSE CAMBIATE APPOSTA ────────────────────────────────────────────

   1) LE IPOTESI SONO DATI, NON COSTANTI SEPOLTE. Nel Lab erano `const` in
      cima al file: nessuno le vedeva e nessuno poteva cambiarle. Qui ognuna
      porta con se' etichetta, valore, unita' e da dove viene, cosi' la
      schermata puo' mostrarle ACCANTO ai numeri e il consulente puo'
      correggerle. Un rendimento del 3,5% non e' un fatto: e' un'ipotesi, e chi
      firma il report deve poterla leggere e discutere.

   2) NESSUNA DATA «ADESSO» NASCOSTA DENTRO. Il Lab chiamava
      `new Date().getFullYear()` dentro il calcolo. Un conto che cambia da solo
      col passare del tempo non si puo' firmare, e qui si firma davvero: il
      report va al cliente. L'anno di partenza si passa da fuori, sempre.

   3) OGNI RISULTATO PORTA LE SUE IPOTESI E LA VERSIONE DELLE REGOLE. Un report
      di sei mesi fa deve restare rileggibile con le regole con cui e' nato.
      Per questo ogni risultato include lo snapshot completo di cio' che e'
      stato usato per produrlo: senza, fra un anno nessuno sapra' piu' dire
      perche' quel numero era quel numero.

   TUTTO STA DENTRO UN CONTENITORE: da <script src> ogni `var` di primo livello
   diventerebbe una variabile globale della pagina, e index.html ha gia' i suoi
   nomi.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

/* Cambia quando cambia una REGOLA di calcolo, non quando si cambia un'ipotesi
   (quelle viaggiano nello snapshot di ogni singolo risultato). */
var VERSIONE_REGOLE = '2026-09-01';

/* ── Le ipotesi ────────────────────────────────────────────────────────────
   `v` e' il valore usato dal calcolo. Il resto serve a mostrarlo a chi legge:
   `etichetta` sulla schermata, `unita` per formattare, `fonte` per rispondere
   alla domanda «e questo numero da dove esce?» senza aprire il codice.
   `modificabile:false` marca cio' che viene dalla legge e non si tocca. */
var IPOTESI = {
  coeffTfr: { v: 13.5, etichetta: 'Divisore del TFR', unita: '', modificabile: false,
    fonte: 'Art. 2120 c.c.: la quota annua e\' la retribuzione divisa per 13,5' },
  dedAzienda: { v: 0.04, etichetta: 'Deduzione dal reddito d\'impresa', unita: '%', modificabile: false,
    fonte: 'Art. 105 TUIR: 4%, che diventa 6% sotto i 50 dipendenti' },
  dedAziendaPiccola: { v: 0.06, etichetta: 'Deduzione (sotto i 50 dipendenti)', unita: '%', modificabile: false,
    fonte: 'Art. 105 TUIR' },
  sogliaPiccola: { v: 50, etichetta: 'Soglia «piccola impresa»', unita: 'dipendenti', modificabile: false,
    fonte: 'Sotto questa soglia la deduzione passa dal 4% al 6%' },
  fondoGaranzia: { v: 0.002, etichetta: 'Esonero Fondo di Garanzia INPS', unita: '%', modificabile: false,
    fonte: '0,20% del monte retributivo' },
  oneriImpropri: { v: 0.0028, etichetta: 'Riduzione oneri impropri', unita: '%', modificabile: false,
    fonte: '0,28% del monte retributivo' },
  rivalTfr: { v: 0.0375, etichetta: 'Rivalutazione annua del TFR in azienda', unita: '%', modificabile: true,
    fonte: '1,5% fisso + 75% dell\'inflazione; con inflazione al 3% fa 3,75%' },
  aliqImpostaRival: { v: 0.11, etichetta: 'Imposta sostitutiva sulla rivalutazione', unita: '%', modificabile: false,
    fonte: 'Aliquota di legge sulla rivalutazione del TFR accantonato' },
  inflazione: { v: 0.03, etichetta: 'Inflazione attesa', unita: '%', modificabile: true,
    fonte: 'Ipotesi: fa crescere il monte retributivo anno su anno' },
  rendFondo: { v: 0.035, etichetta: 'Rendimento netto del fondo', unita: '%', modificabile: true,
    fonte: 'Ipotesi prudenziale. Non e\' garantito e non e\' una promessa' },
  dedMax: { v: 5164.57, etichetta: 'Deduzione massima annua', unita: '€', modificabile: false,
    fonte: 'Art. 8 D.lgs. 252/2005, previdenza complementare' },
};

/* Le ipotesi in vigore per un calcolo: le predefinite, piu' le correzioni di
   chi consulta. Si accettano sia `{rendFondo: 0.04}` sia `{rendFondo: {v: 0.04}}`,
   perche' dall'interfaccia arriva un numero e da un report salvato un oggetto. */
function ipotesiAttive(correzioni) {
  var out = {};
  for (var k in IPOTESI) {
    if (!Object.prototype.hasOwnProperty.call(IPOTESI, k)) continue;
    var base = IPOTESI[k];
    out[k] = { v: base.v, etichetta: base.etichetta, unita: base.unita,
               fonte: base.fonte, modificabile: base.modificabile, corretta: false };
  }
  if (correzioni) {
    for (var c in correzioni) {
      if (!Object.prototype.hasOwnProperty.call(correzioni, c) || !out[c]) continue;
      var val = correzioni[c] && typeof correzioni[c] === 'object' ? correzioni[c].v : correzioni[c];
      if (val == null || val === '' || isNaN(Number(val))) continue;
      /* Cio' che viene dalla legge non si corregge: accettarlo in silenzio
         produrrebbe un report che sembra valido e non lo e'. */
      if (!out[c].modificabile) continue;
      out[c].v = Number(val);
      out[c].corretta = true;
    }
  }
  return out;
}
var val = function (ip, k) { return ip[k].v; };

/* La quota di TFR maturata in un anno. */
function tfrQuotaAnnua(retribuzioneAnnua, ip) {
  ip = ip || ipotesiAttive();
  return (Number(retribuzioneAnnua) || 0) / val(ip, 'coeffTfr');
}

/* ── C · LATO AZIENDA ──────────────────────────────────────────────────────
   Quanto vale, per l'azienda, destinare il TFR alla previdenza complementare.
   Quattro misure compensative che si sommano anno dopo anno:
     mis1  deduzione dal reddito d'impresa sulla quota di TFR versata
     mis2  esonero dal contributo al Fondo di Garanzia INPS
     mis3  riduzione degli oneri impropri
     mis4  esonero dall'imposta sostitutiva sulla rivalutazione del TFR
           gia' accantonato (dal secondo anno in poi: il primo anno non c'e'
           ancora nulla di accantonato da rivalutare)

   `annoInizio` arriva da fuori: vedi la nota 2 in testa al file. */
function pianoAzienda(dati, correzioni) {
  var ip = ipotesiAttive(correzioni);
  var dipendenti = Number(dati && dati.dipendenti) || 0;
  var stipendioMensile = Number(dati && dati.stipendioMensile) || 0;
  var anni = Number(dati && dati.anni) || 20;
  var annoInizio = Number(dati && dati.annoInizio);

  var problemi = [];
  if (dipendenti <= 0) problemi.push('Serve il numero di dipendenti.');
  if (stipendioMensile <= 0) problemi.push('Serve lo stipendio medio mensile.');
  if (!annoInizio) problemi.push('Serve l\'anno di partenza (va passato, non dedotto dall\'orologio).');
  if (anni <= 0) problemi.push('Serve un orizzonte di almeno un anno.');
  /* «Dati insufficienti» e' uno stato suo, diverso da un risultato a zero: un
     conto vuoto e un conto che fa zero non sono la stessa cosa. */
  if (problemi.length) {
    return { ok: false, motivo: 'dati_insufficienti', problemi: problemi,
             versioneRegole: VERSIONE_REGOLE, ipotesi: ip };
  }

  var piccola = dipendenti < val(ip, 'sogliaPiccola');
  var percDed = piccola ? val(ip, 'dedAziendaPiccola') : val(ip, 'dedAzienda');

  var righe = [];
  var monteCurr = dipendenti * stipendioMensile * 12;
  var monteIniziale = monteCurr;
  var tfrAccantonato = 0, rispTotale = 0, tfrTotale = 0;

  for (var i = 0; i < anni; i++) {
    var monte = monteCurr;
    var tfr = monte / val(ip, 'coeffTfr');
    tfrAccantonato += tfr;
    tfrTotale += tfr;
    var mis1 = tfr * percDed;
    var mis2 = monte * val(ip, 'fondoGaranzia');
    var mis3 = monte * val(ip, 'oneriImpropri');
    var mis4 = i > 0 ? (tfrAccantonato - tfr) * val(ip, 'rivalTfr') * val(ip, 'aliqImpostaRival') : 0;
    var rispAnno = mis1 + mis2 + mis3 + mis4;
    rispTotale += rispAnno;
    righe.push({ anno: annoInizio + i, monteRetributivo: monte, quotaTfr: tfr,
                 deduzione: mis1, fondoGaranzia: mis2, oneriImpropri: mis3,
                 esoneroRivalutazione: mis4, risparmioAnno: rispAnno, risparmioCumulato: rispTotale });
    monteCurr *= (1 + val(ip, 'inflazione'));
  }

  return {
    ok: true,
    versioneRegole: VERSIONE_REGOLE,
    ipotesi: ip,                       // lo snapshot: il report resta rileggibile
    azienda: { dipendenti: dipendenti, stipendioMensile: stipendioMensile,
               piccola: piccola, percentualeDeduzione: percDed, anni: anni, annoInizio: annoInizio },
    righe: righe,
    totali: {
      risparmio: rispTotale,
      tfrDestinato: tfrTotale,
      /* Le due percentuali servono a rispondere a due domande diverse: quanto
         pesa il risparmio sul TFR che ho spostato, e quanto sul costo del
         personale. Confonderle fa dire numeri sbagliati a voce. */
      risparmioSuTfr: tfrTotale > 0 ? (rispTotale / tfrTotale) * 100 : 0,
      risparmioSuMonte: (monteIniziale * anni) > 0 ? (rispTotale / (monteIniziale * anni)) * 100 : 0,
    },
    /* I motivi: un numero senza il perche' non e' consulenza. */
    motivi: [
      (piccola ? 'Sotto i ' + val(ip, 'sogliaPiccola') + ' dipendenti' : 'Da ' + val(ip, 'sogliaPiccola') + ' dipendenti in su') +
        ': la deduzione applicata e\' il ' + (percDed * 100).toFixed(0) + '%.',
      'Il monte retributivo cresce del ' + (val(ip, 'inflazione') * 100).toFixed(1).replace('.', ',') +
        '% l\'anno per l\'inflazione ipotizzata.',
      'L\'esonero dall\'imposta sulla rivalutazione parte dal secondo anno: nel primo non c\'e\' ancora TFR accantonato da rivalutare.',
    ],
  };
}

/* ── Esposizione ai due mondi ──────────────────────────────────────────── */
var API = {
  VERSIONE_REGOLE: VERSIONE_REGOLE,
  IPOTESI: IPOTESI,
  ipotesiAttive: ipotesiAttive,
  tfrQuotaAnnua: tfrQuotaAnnua,
  pianoAzienda: pianoAzienda,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.Previdenza = API;
})();
