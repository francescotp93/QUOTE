import crypto from 'node:crypto';

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const sum = (arr, get) => {
  const vals = arr.map(get).map(num).filter((v) => v !== null);
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) * 100) / 100 : null;
};

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

/**
 * MOTOR: il premio mostrato in UI e' la somma di coverageAmounts.legal
 * su tutte le voci di installmentPrices.
 *   verifica sul campione BL716506676:
 *     RCA 140.33 + Assistenza stradale 70.00 = 210.33  == UI "€ 210,33 / Anno"
 *   `presentation` e' il prezzo di listino mostrato barrato,
 *   `full` il prezzo pieno senza sconti.
 */
function motorEconomics(pd) {
  const lines = pd.installmentPrices || [];
  return {
    premium_legal: sum(lines, (l) => l?.coverageAmounts?.legal),
    premium_presentation: sum(lines, (l) => l?.coverageAmounts?.presentation),
    premium_full: sum(lines, (l) => l?.coverageAmounts?.full),
    early_discount: sum(lines, (l) => l?.coverageAmounts?.earlyDiscount),
    payment_frequency: pd.installmentConfiguration?.labels?.name ?? null,
    issuing_company: null,
    guarantees: lines.map((l) => ({
      slug: l.slug,
      nome: l.name,
      dettaglio: (l.label || '').replace(/<br\s*\/?>/gi, ' | '),
      prezzo: num(l?.coverageAmounts?.legal),
      prezzo_pieno: num(l?.coverageAmounts?.full),
      opzioni: (l.options || []).map((o) => o.slug),
    })),
  };
}

/** HOME: il prezzo e' gia' aggregato in selection.fullPrice / packages. */
function homeEconomics(pd) {
  const sel = pd.selection || {};
  const packages = sel.packages || [];
  const guarantees = [];
  for (const p of packages) {
    for (const c of p.clusters || []) {
      for (const g of c.guarantees || []) {
        guarantees.push({
          pacchetto: p.slug || p.label,
          cluster: c.label,
          nome: g.label,
          prezzo: num(g?.price?.amount),
          prezzo_pieno: num(g?.fullPrice?.amount),
        });
      }
    }
  }
  return {
    premium_legal: num(sel?.fullPrice?.amount) ?? sum(packages, (p) => p?.price?.amount),
    premium_presentation: sum(packages, (p) => p?.fullPrice?.amount),
    premium_full: sum(packages, (p) => p?.fullPrice?.amount),
    early_discount: null,
    payment_frequency: sel.paymentFrequency ?? null,
    issuing_company: sel?.issuingCompany?.slug ?? null,
    guarantees,
  };
}

/** Converte un item searchSavesNew in una riga di public.prima_preventivi. */
export function normalize(item) {
  const pd = item.productData || {};
  const isMotor = pd.__typename === 'SearchItemProductMotorData';
  const eco = isMotor ? motorEconomics(pd) : homeEconomics(pd);

  const row = {
    uuid: item.uuid,
    quote_uuid: item.quoteUuid ?? null,
    code: item.code,
    reference: item.reference ?? null,
    reference_hash: item.reference ? sha(item.reference.toUpperCase()) : null,

    product_type: isMotor ? 'MOTOR' : 'HOME',
    vehicle_type: isMotor ? (pd.vehicle?.vehicleType ?? null) : null,
    status: item.status,
    quote_type: item.type ?? null,
    tariff: isMotor ? (pd.tariff ?? null) : null,
    guide_type: isMotor ? (pd.guideType ?? null) : null,
    color_case: isMotor ? (pd.colorCase ?? null) : null,
    is_substitution: isMotor ? !!pd.isSubstitution : false,
    created_by_mass_quote: !!item.createdByMassQuote,
    has_flexibility_applied: !!item.hasFlexibilityApplied,

    contractor_name: item.contractor?.companyNameOrFullName ?? null,
    mail_intermediario: item.mailIntermediario ?? null,

    created_at_source: item.createdAt ?? null,
    effective_date: item.effectiveDate ?? null,
    expiration_date: item.expirationDate ?? null,

    ...eco,
    guarantees: eco.guarantees,
    raw: item,
  };

  // Hash del contenuto "di business": ci permette di non riscrivere righe
  // identiche a ogni run e di distinguere update reali da semplici re-scan.
  const { raw, ...business } = row;
  row.content_hash = sha(JSON.stringify(business));
  return row;
}
