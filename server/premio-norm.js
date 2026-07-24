// Normalizzatore PremioNorm — M2 del piano di integrazione
// (vedi Progetto: claude/piano-integrazione-motor-quoto.md).
//
// Porta le risposte (oggi disomogenee) dei vari scraper compagnia a UN UNICO formato,
// allineato al contratto reale di Quotiamo (claude/quotiamo-contratto-quotation.md) e al
// PremioNorm di docs/ARCHITETTURA-MULTICOMPAGNIA.md.
//
// File NUOVO e SEPARATO: NON è importato in produzione -> nessuna regressione.

// Numero robusto: accetta 423.5, "423,50", "€ 1.275,00", null...
export function num(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v)
    .replace(/[^\d,.-]/g, '')          // via simboli/valuta/spazi
    .replace(/\.(?=\d{3}(\D|$))/g, '') // via il punto delle migliaia (1.275 -> 1275)
    .replace(',', '.');                // virgola decimale -> punto
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

const arr = (v) => (Array.isArray(v) ? v.filter(Boolean) : v ? [v] : []);

// Forma canonica del premio di UNA compagnia (una card nel comparatore).
export function premioNorm(partial = {}) {
  const base = {
    compagnia: null,
    prodotto: null,
    numero_preventivo: null,
    sconto_pct: null,
    semestrale: null, // { totale, premio_polizza, diritti } se disponibile
    provvigioni: null, // { commissions, fees } (stile Quotiamo)
    garanzie_incluse: [],
    premio_min: null,
    daAutorizzare: false,
    salvato: false,
    veicolo: null,
    errore: null,
    dettaglio: {},
  };
  const out = { ...base, ...partial };
  // annuale gestito a parte per non perdere le sotto-chiavi con lo spread
  out.annuale = { totale: null, premio_polizza: null, diritti: null, ...(partial.annuale || {}) };
  return out;
}

// Un mapper per compagnia: (risposta grezza dello scraper) -> PremioNorm.
// Se lo scraper ha risposto con errore (ok=false o premio assente) si produce una card "errore",
// così il comparatore mostra comunque la riga della compagnia con il motivo.
export const MAPPERS = {
  italiana(d) {
    if (!d || !d.ok) return premioNorm({ compagnia: 'Italiana Assicurazioni', errore: (d && d.error) || 'non disponibile' });
    return premioNorm({
      compagnia: d.compagnia || 'Italiana Assicurazioni',
      annuale: { totale: num(d.premio) },
      provvigioni: d.provvigioni != null ? { commissions: num(d.provvigioni), fees: null } : null,
      daAutorizzare: !!d.daAutorizzare,
      salvato: !!d.salvato,
      garanzie_incluse: ['Infortuni del conducente', 'Sconto massimo'],
      veicolo: d.veicolo || null,
      dettaglio: { anagrafica: d.anagrafica || null, situazione: d.situazione || null },
    });
  },

  hdi(d) {
    if (!d || !d.ok || d.premio_annuale_num == null) return premioNorm({ compagnia: 'HDI Assicurazioni', errore: (d && d.error) || 'non disponibile' });
    return premioNorm({
      compagnia: d.compagnia || 'HDI Assicurazioni',
      annuale: { totale: num(d.premio_annuale_num) },
      garanzie_incluse: arr(d.garanzie),
      veicolo: d.veicolo || null,
    });
  },

  allianz(d) {
    // /premio può arrivare "wrappato" ({ ok, premio:{...} }) o piatto ({ ok, premio_annuale_num }).
    const p = d && d.premio && typeof d.premio === 'object' ? d.premio : d;
    const tot = p && (p.premio_annuale_num != null ? p.premio_annuale_num : p.premio_totale_num != null ? p.premio_totale_num : p.premio);
    if (!d || !d.ok || num(tot) == null) return premioNorm({ compagnia: 'Allianz', errore: (d && d.error) || 'non disponibile' });
    return premioNorm({
      compagnia: 'Allianz',
      annuale: { totale: num(tot) },
      garanzie_incluse: arr(p && p.garanzie),
      veicolo: (p && p.veicolo) || null,
      dettaglio: { raw: p || null },
    });
  },

  groupama(d) {
    if (!d || !d.ok || d.premio_annuale_num == null) return premioNorm({ compagnia: 'Groupama', errore: (d && d.error) || 'non disponibile' });
    return premioNorm({
      compagnia: 'Groupama',
      prodotto: d.prodotto || 'Guidamica Autovetture',
      annuale: { totale: num(d.premio_annuale_num) },
      veicolo:
        d.marca || d.modello
          ? { marca: d.marca || null, modello: d.modello || null, valore: d.valore_assicurato || null, cu: d.cu || null, bm: d.bm || null }
          : null,
    });
  },

  axa(d) {
    if (!d || !d.ok || d.premio_annuale_num == null) return premioNorm({ compagnia: 'AXA', errore: (d && d.error) || 'non disponibile' });
    return premioNorm({
      compagnia: 'AXA',
      prodotto: d.prodotto || 'Nuova Protezione Auto',
      annuale: { totale: num(d.premio_annuale_num) },
    });
  },

  moto24h(d) {
    if (!d || !d.ok) return premioNorm({ compagnia: 'Moto Platinum', errore: (d && d.error) || 'non disponibile' });
    return premioNorm({
      compagnia: d.compagnia || 'Moto Platinum',
      annuale: { totale: num(d.premio_totale_num != null ? d.premio_totale_num : d.premio_totale) },
      semestrale: null, // Moto Platinum (H24): solo frazionamento annuale
      garanzie_incluse: [...new Set(['Rinuncia alla rivalsa', ...arr(d.garanzie_incluse)].map((g) => String(g).trim()).filter(Boolean))],
      veicolo: d.veicolo || null,
      dettaglio: { werepair: !!d.werepair, opzione_incendio_furto: d.opzione_incendio_furto || null },
    });
  },
};

// Normalizza la risposta grezza di una compagnia dato il suo id di registry (companies.js).
export function normalize(companyId, rawResponse) {
  const mapper = MAPPERS[companyId];
  if (!mapper) return premioNorm({ compagnia: companyId, errore: 'nessun mapper per ' + companyId });
  try {
    return mapper(rawResponse);
  } catch (e) {
    return premioNorm({ compagnia: companyId, errore: 'map error: ' + e.message });
  }
}

export default { normalize, premioNorm, MAPPERS, num };
