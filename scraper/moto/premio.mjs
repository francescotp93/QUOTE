// ─────────────────────────────────────────────────────────────────────────────
//  MOTO / 24H — LA SCELTA DEL PREMIO RCA (la parte pura, provabile)
//
//  readPremio24() (in quote-service.mjs) fa due cose diverse:
//    1. cammina il DOM della pagina prezzo e raccoglie i CANDIDATI — questo vive
//       nel browser (page.evaluate) e non si prova senza un DOM vero;
//    2. SCEGLIE quale candidato è il premio RCA — esclude il valore del veicolo
//       e il massimale, e fra i «totali» veri (quelli con un nome prodotto)
//       prende il più basso. QUESTA è pura aritmetica su una lista, ed è
//       esattamente il punto che un refactor può rompere mostrando il numero
//       sbagliato (il valore del veicolo al posto del premio).
//
//  Qui c'è solo la parte 2, isolata, così ha una prova che la blocca. La logica
//  è quella IDENTICA di readPremio24: se un domani la si tocca, la prova
//  (verifica/premio.test.mjs) lo dice prima che lo veda un operatore.
//
//  NB: finché quote-service.mjs non importa questa funzione, è la definizione di
//  riferimento del comportamento atteso; il passo di estrazione del core la
//  aggancerà, e questa prova garantirà che il premio esca uguale.
// ─────────────────────────────────────────────────────────────────────────────

/** "601,53" | "1.234,56"  →  1234.56 ; niente di leggibile → NaN (come l'originale). */
export function num(s) {
  return parseFloat(String(s || '').replace(/\./g, '').replace(',', '.'));
}

/**
 * Sceglie il premio RCA fra i candidati estratti dal DOM.
 * @param out    [{ prezzo, ctx }]     prezzi con la loro etichetta di riga
 * @param totali [{ prezzo, prodotto }] i «Totale …» con il nome prodotto vicino
 * @returns { premio_rca, premio_rca_num, opzione_incendio_furto }
 */
export function scegliPremioRca(out, totali) {
  out = Array.isArray(out) ? out : [];
  totali = Array.isArray(totali) ? totali : [];

  // il premio RCA "storico": un prezzo la cui etichetta parla di RCA/responsabilità,
  // ma NON del valore veicolo (CU 123…, «valore»).
  const rca = out.find(p => /RCA|RC\s*completa|responsabilit/i.test(p.ctx) && !/CU\s*\d|valore/i.test(p.ctx));
  const furto = out.find(p => /incendio e furto|furto/i.test(p.ctx));

  // i veri totali RCA hanno un nome prodotto (Motoapp/WeRepair/Livello…), NON
  // «valore/massimale/assicurato»: quelli sono il valore del veicolo, non un premio.
  const veriTotali = totali.filter(t => t.prodotto && !/valore|massimale|assicurat/i.test(t.prodotto));
  const pool = veriTotali.length ? veriTotali : totali;
  // RCA base = il totale reale più basso (il layout mostra più prodotti).
  const base = pool.length ? pool.reduce((a, b) => num(b.prezzo) < num(a.prezzo) ? b : a) : null;

  const premioFin = base ? base.prezzo : (rca ? rca.prezzo : null);
  return {
    premio_rca: premioFin,
    premio_rca_num: premioFin ? num(premioFin) : null,
    opzione_incendio_furto: furto ? furto.prezzo : null,
  };
}
