// ─────────────────────────────────────────────────────────────────────────────
//  QUOTO · Prima Connector — SCELTA DELLA RATA E LETTURA DEL PREMIO
//
//  PERCHÉ QUESTO FILE ESISTE.
//
//  La covers-api di Prima non restituisce «il premio»: restituisce un elenco di
//  OPZIONI DI PAGAMENTO (annuale, semestrale, mensile…), ognuna con le sue
//  garanzie e i suoi importi. Il totale di un'opzione è la somma delle garanzie
//  selezionate sul campo `legal`.
//
//  L'estensione prendeva `installments[0]` — la prima opzione che capitava — e
//  la chiamava `premio_annuale`. Due conseguenze, tutte e due brutte:
//
//    1. se la prima opzione è la mensile, il numero mostrato è UNA RATA
//       spacciata per il premio dell'anno. In un preventivo assicurativo un
//       premio troppo basso è l'errore peggiore: il cliente lo vede, ci conta,
//       e la differenza salta fuori in fase di emissione;
//    2. il frazionamento che l'operatore sceglie in QUOTO veniva passato
//       all'estensione e poi ignorato del tutto.
//
//  Qui l'opzione si SCEGLIE, e se non si riesce a capire quale sia si dice —
//  invece di consegnare un numero che potrebbe essere di un'altra cosa.
//
//  Sta in un file suo perché è l'unico pezzo dell'estensione che si può mettere
//  alla prova senza il portale: è aritmetica su una risposta, non una
//  navigazione. Le prove stanno in verifica/prezzo.test.mjs.
// ─────────────────────────────────────────────────────────────────────────────
(function (radice) {
  'use strict';

  /** "591.09" | "591,09" | 591.09  →  591.09 ; niente di leggibile → null */
  function euro(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(String(v).replace(',', '.'));
    return isFinite(n) ? Math.round(n * 100) / 100 : null;
  }

  /* Quante rate ha un'opzione. Prima lo dice in più modi a seconda del prodotto:
     si guardano tutti prima di arrendersi. */
  function quanteRate(inst) {
    var c = inst && inst.installmentConfiguration;
    if (!c) return null;
    if (typeof c.count === 'number' && c.count > 0) return c.count;
    if (typeof c.size === 'number' && c.size > 0) return c.size;
    var testo = String((c.labels && c.labels.name) || c.slug || '').toLowerCase();
    if (/annual|unica|soluzione unica/.test(testo)) return 1;
    if (/semestr/.test(testo)) return 2;
    if (/quadrimestr/.test(testo)) return 3;
    if (/trimestr/.test(testo)) return 4;
    if (/mensil/.test(testo)) return 12;
    return null;
  }

  /* Quante rate vuole l'operatore. QUOTO manda la parola, non il numero. */
  function rateChieste(frazionamento) {
    var t = String(frazionamento || '').toLowerCase();
    if (/mensil/.test(t)) return 12;
    if (/trimestr/.test(t)) return 4;
    if (/quadrimestr/.test(t)) return 3;
    if (/semestr/.test(t)) return 2;
    return 1;                       // in mancanza d'altro: annuale
  }

  /** Il totale di un'opzione: somma delle sole garanzie SELEZIONATE, campo `legal`. */
  function totaleOpzione(inst) {
    var g = (inst && inst.guarantees) || [];
    var scelte = [], somma = 0;
    for (var i = 0; i < g.length; i++) {
      if (!g[i] || !g[i].selected) continue;
      var pb = (g[i].priceBlocks || [])[0];
      var v = pb && pb.coveragePrice ? euro(pb.coveragePrice.legal) : null;
      if (v === null) continue;
      somma += v;
      scelte.push({ slug: g[i].slug, label: g[i].label || g[i].slug, prezzo: v });
    }
    if (!scelte.length) return null;   // nessuna garanzia selezionata: non è «zero»
    return { totale: Math.round(somma * 100) / 100, garanzie: scelte };
  }

  /**
   * Sceglie l'opzione di pagamento chiesta e ne legge il premio.
   * Restituisce { ok:true, ... } oppure { ok:false, error } — mai un numero
   * di cui non si sappia a cosa si riferisce.
   */
  function leggiPremio(quote, frazionamento) {
    var piani = (quote && quote.installmentPrices) || [];
    if (!piani.length) return { ok: false, error: 'Prima non ha restituito nessun piano di pagamento.' };

    /* Tutte le opzioni di tutti i piani, appiattite: quello che conta è quante
       rate ha ognuna, non in quale piano si trovava. */
    var opzioni = [];
    for (var p = 0; p < piani.length; p++) {
      var lista = (piani[p] && piani[p].installments) || [];
      for (var i = 0; i < lista.length; i++) {
        var t = totaleOpzione(lista[i]);
        if (!t) continue;
        opzioni.push({
          rate: quanteRate(lista[i]),
          nome: (lista[i].installmentConfiguration && ((lista[i].installmentConfiguration.labels || {}).name || lista[i].installmentConfiguration.slug)) || null,
          totale: t.totale,
          garanzie: t.garanzie,
        });
      }
    }
    if (!opzioni.length) return { ok: false, error: 'Nessuna opzione di pagamento ha garanzie selezionate con un prezzo.' };

    var volute = rateChieste(frazionamento);
    var scelta = null;
    for (var k = 0; k < opzioni.length; k++) if (opzioni[k].rate === volute) { scelta = opzioni[k]; break; }

    /* NIENTE RIPIEGHI SILENZIOSI. Se il frazionamento chiesto non c'è, si dice
       cosa c'è e ci si ferma: consegnare «la prima disponibile» è esattamente
       il difetto che questo file esiste per togliere. */
    if (!scelta) {
      var avute = opzioni.map(function (o) { return (o.rate || '?') + ' rate'; }).join(', ');
      return {
        ok: false,
        error: 'Prima non offre il frazionamento richiesto (' + volute + ' rate) per questo preventivo. Disponibili: ' + avute + '.',
        disponibili: opzioni.map(function (o) { return { rate: o.rate, nome: o.nome, totale: o.totale }; }),
      };
    }

    /* Il premio ANNUO è la somma di tutte le rate dell'anno, non l'importo di
       una rata. Con 12 rate da 50 € il cliente paga 600 € in un anno: scrivere
       50 nel campo «premio annuo» è la bugia da cui nasce tutto questo file. */
    var annuo = Math.round(scelta.totale * (scelta.rate || 1) * 100) / 100;

    return {
      ok: true,
      premio_annuo: annuo,
      premio_rata: scelta.totale,
      rate: scelta.rate,
      frazionamento: scelta.nome,
      garanzie: scelta.garanzie,
      /* Le altre, per poterle mostrare senza rifare il giro. */
      alternative: opzioni.filter(function (o) { return o !== scelta; })
        .map(function (o) { return { rate: o.rate, nome: o.nome, rata: o.totale, annuo: Math.round(o.totale * (o.rate || 1) * 100) / 100 }; }),
    };
  }

  var api = { euro: euro, quanteRate: quanteRate, rateChieste: rateChieste, totaleOpzione: totaleOpzione, leggiPremio: leggiPremio };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (radice) radice.__QP_PREZZO = api;
})(typeof window !== 'undefined' ? window : null);
