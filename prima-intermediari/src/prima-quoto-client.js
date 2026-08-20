// ---------------------------------------------------------------------
// Client Prima Intermediari per Quoto.
//
// Copre ENTRAMBI gli endpoint GraphQL del portale:
//   /api/graphql            -> portafoglio, form, scadenzario, flessibilita'
//   /mfe/covers-api/graphql -> garanzie e PREZZI (la tariffazione vera)
//
// Auth: solo cookie di sessione (vedi src/auth.js per l'MFA).
// ---------------------------------------------------------------------
import { graphqlWithRetry } from './client.js';
import { PRIMA } from './config.js';

const COVERS_URL = 'https://intermediari.prima.it/mfe/covers-api/graphql';

// =====================================================================
// Normalizzazione prezzi — IL punto critico
//
// I due endpoint usano unita' DIVERSE:
//   covers-api          -> stringa in euro   "591.09"  = 591,09 EUR
//   api/graphql (flex)  -> intero in centesimi  41720   = 417,20 EUR
//
// Normalizziamo qui, al confine. Dentro Quoto circola SOLO euro come Number.
// =====================================================================

/** "591.09" | 591.09 -> 591.09 ; null/""/undefined -> null */
export function euroFromString(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** 41720 -> 417.20 */
export function euroFromCents(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) / 100 : null;
}

/** 417.20 -> 41720 (per rispedire importi a rewardedFlexibility) */
export function centsFromEuro(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

// =====================================================================
// Trasporto
// =====================================================================

async function callPortal(query, cookie, label) {
  const { data } = await graphqlWithRetry(query, { cookie, label });
  return data;
}

async function callCovers(query, variables, cookie, label = 'covers') {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PRIMA.timeoutMs);
  try {
    const res = await fetch(COVERS_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: PRIMA.base,
        referer: `${PRIMA.base}/`,
        cookie,
      },
      body: JSON.stringify({ query, variables }),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      const e = new Error(`covers-api: risposta non-JSON (HTTP ${res.status})`);
      e.retryable = true;
      throw e;
    }
    if (json.errors?.length) {
      throw new Error(`covers-api [${label}]: ${json.errors.map((x) => x.message).join(' | ')}`);
    }
    return json.data;
  } finally {
    clearTimeout(timer);
  }
}

// =====================================================================
// 1. Anagrafiche di supporto
// =====================================================================

/** Autocomplete comuni: restituisce ISTAT e CAP. Usabile come normalizzatore indirizzi. */
export async function cities(cookie, filter, date = new Date().toISOString().slice(0, 10)) {
  const d = await callPortal(
    `{ cities(date: "${date}", filter: ${JSON.stringify(filter)}) { name province istat zipCodes { zip } } }`,
    cookie, 'cities'
  );
  return d.cities;
}

export async function countries(cookie) {
  const d = await callPortal('{ countries { name landRegister } }', cookie, 'countries');
  return d.countries;
}

// =====================================================================
// 2. Apertura preventivo: targa + data nascita -> veicolo + precompilato
// =====================================================================

export async function formConfiguration(cookie, {
  plateNumber,
  ownerBirthDate,            // "YYYY-MM-DD"
  inheritedAtrType = 'NO',   // RC Auto familiare
  insuranceType = 'BONUS_MALUS',
  legalEntity = false,
}) {
  if (!plateNumber || !ownerBirthDate) {
    throw new Error('formConfiguration: plateNumber e ownerBirthDate sono obbligatori (String!)');
  }
  const q = `query {
  formConfiguration(fetchFormConfigurationQuery: {
    plateNumber: ${JSON.stringify(plateNumber)},
    ownerBirthDate: ${JSON.stringify(ownerBirthDate)},
    inheritedAtrType: ${inheritedAtrType},
    insuranceType: ${insuranceType},
    legalEntity: ${legalEntity}
  }) {
    useFastquote
    vehicleInfo {
      vehicleType weight
      availableFinitures { code name brandCode brandName modelCode kw displacement mass fuelFlag value }
    }
    quoteData {
      originalSaveId whoIsDriver guideType insuranceType inheritedAtrType legalEntity
      effectiveDateDate effectiveDateTime phoneNumber conventionDiscountCode contractorIsOwner
      vehicle { plateNumber type registrationDate purchaseDate powerSource brandCode modelCode
                finitureCode kw displacement ownUse yearMileage hasLoan activity }
      owner { firstName lastName gender fiscalCode birthDate birthCity birthCountry bornAbroad
              civilStatus occupation licenseYear noLicense
              residentialAddress residentialCivicNumber residentialCity residentialCap
              residenceIsDomicile }
      atr { toRiskCategory toInternalRiskCategory
            details { year principale paritario
                      principaleCose principalePersone principaleMista
                      paritarioCose paritarioPersone paritarioMista } }
    }
  }
}`;
  const d = await callPortal(q, cookie, 'formConfiguration');
  return d.formConfiguration;
}

// =====================================================================
// 3. Tariffazione: garanzie e prezzi (covers-api)
// =====================================================================

const QUOTE_COVERS_QUERY = `query Quote($id: UUID!) {
  quote(id: $id) {
    __typename
    ... on Quote {
      id tariff selected guideType effectiveDate isSubstitution contractorIsOwner
      toRiskCategory insuredYears totalNumberOfClaims substitutionReasons
      issuingCompany { slug label name completeName }
      messages { code metadata { name value } }
      atrDetails {
        year
        ... on AtrDetail2015    { principaleCose principaleMista principalePersone paritarioCose paritarioMista paritarioPersone }
        ... on AtrDetailPre2015 { principale paritario }
      }
      installmentPrices {
        canBeSaved earlyDiscountExpirationDate earlyDiscountRemainingDays
        installments {
          installmentConfiguration { slug unit size count selected automaticPayments
                                     labels { name payment period periodInMonths } }
          guarantees {
            slug label selected isMandatory weight
            description { full detail bundle }
            priceBlocks {
              isRefund
              coveragePrice { legal presentation full min max flexibilityMax
                              taxesPercentage bundleDiscount earlyDiscount
                              riparaPrimaDiscount companyTax }
            }
          }
        }
      }
    }
    ... on QuoteError { error }
  }
}`;

/** Autorizzazione richiesta dal micro-frontend prima di leggere le garanzie. */
export async function authorizeSalesFlow(cookie, quoteUuid) {
  const d = await callPortal(
    `{ authorizeSalesFlow(resourceId: ${JSON.stringify(quoteUuid)}, resourceType: QUOTE) { token } }`,
    cookie, 'authorizeSalesFlow'
  );
  return d.authorizeSalesFlow?.token ?? null;
}

/**
 * Garanzie + prezzi di una quotazione, gia' normalizzati in euro.
 * ATTENZIONE: quoteUuid, NON saveUuid (sono due id diversi).
 */
export async function getQuoteCovers(cookie, quoteUuid) {
  await authorizeSalesFlow(cookie, quoteUuid).catch(() => null); // best effort, come fa la UI
  const d = await callCovers(QUOTE_COVERS_QUERY, { id: quoteUuid }, cookie, 'quote');
  const q = d.quote;
  if (!q || q.__typename === 'QuoteError') {
    throw new Error(`Quotazione non leggibile: ${q?.error ?? 'risposta vuota'}`);
  }
  return normalizeQuote(q);
}

/** covers-api restituisce stringhe in euro: qui diventano Number. */
export function normalizeQuote(q) {
  const rate = (q.installmentPrices || []).map((ip) => {
    const inst = (ip.installments || []).map((i) => {
      const garanzie = (i.guarantees || []).map((g) => {
        const pb = (g.priceBlocks || [])[0] || {};
        const cp = pb.coveragePrice || {};
        return {
          slug: g.slug,
          label: g.label,
          selezionata: !!g.selected,
          obbligatoria: !!g.isMandatory,
          descrizione: g.description?.full ?? null,
          prezzo: euroFromString(cp.legal),              // <- il premio effettivo
          prezzo_presentazione: euroFromString(cp.presentation),
          prezzo_pieno: euroFromString(cp.full),
          sconto_min: euroFromString(cp.min),
          sconto_max: euroFromString(cp.max),
          flessibilita_max: euroFromString(cp.flexibilityMax),
          sconto_bundle: euroFromString(cp.bundleDiscount),
          sconto_anticipo: euroFromString(cp.earlyDiscount),
          aliquota_tasse: euroFromString(cp.taxesPercentage),
        };
      });
      const selezionate = garanzie.filter((g) => g.selezionata);
      return {
        frazionamento: i.installmentConfiguration?.labels?.name ?? null,
        rate_count: i.installmentConfiguration?.count ?? null,
        garanzie,
        // Totale = somma delle sole garanzie selezionate, sul campo `legal`.
        premio_totale: selezionate.length
          ? Math.round(selezionate.reduce((a, g) => a + (g.prezzo || 0), 0) * 100) / 100
          : null,
      };
    });
    return {
      salvabile: !!ip.canBeSaved,
      sconto_anticipo_scade: ip.earlyDiscountExpirationDate ?? null,
      sconto_anticipo_giorni: ip.earlyDiscountRemainingDays ?? null,
      opzioni: inst,
    };
  });

  return {
    id: q.id,
    tariffa: q.tariff,
    compagnia: q.issuingCompany?.slug ?? null,
    guida: q.guideType,
    decorrenza: q.effectiveDate,
    sostituzione: !!q.isSubstitution,
    classe_merito: q.toRiskCategory,
    anni_assicurato: q.insuredYears,
    sinistri_totali: q.totalNumberOfClaims,
    attestato_rischio: q.atrDetails ?? [],
    messaggi: q.messages ?? [],
    rate,
  };
}

// =====================================================================
// 4. Sconto commerciale (flessibilita')
// =====================================================================

/** Plafond di flessibilita' residuo + email del cliente. Endpoint portale. */
export async function getQuoteFlexibility(cookie, quoteUuid) {
  const d = await callPortal(
    `{ quote(id: ${JSON.stringify(quoteUuid)}) {
        __typename
        ... on Quote { id email availableFlexibility flexibilityDiscountEnabled substitutionReasons }
        ... on QuoteError { error }
      } }`,
    cookie, 'quoteFlexibility'
  );
  const q = d.quote;
  if (!q || q.__typename === 'QuoteError') return null;
  return {
    id: q.id,
    email: q.email ?? null,                               // <- il contatto che manca altrove
    flessibilita_disponibile: euroFromCents(q.availableFlexibility), // centesimi -> euro
    sconto_abilitato: !!q.flexibilityDiscountEnabled,
  };
}

/**
 * Quanto sconto e' applicabile su una selezione di garanzie.
 * NB: questo endpoint vuole i CENTESIMI, li convertiamo noi.
 * @param covers [{slug, prezzo}] con prezzo in EURO
 */
export async function rewardedFlexibility(cookie, covers) {
  const list = covers
    .map((c) => {
      const cents = centsFromEuro(c.prezzo);
      return `{slug: ${JSON.stringify(c.slug)}, amount: ${cents}, technicalPrice: ${cents}}`;
    })
    .join(', ');
  const d = await callPortal(
    `{ rewardedFlexibility(addOnCoversSelection: {addOnCovers: [${list}]}) { __typename } }`,
    cookie, 'rewardedFlexibility'
  );
  return d.rewardedFlexibility;
}

// =====================================================================
// 5. Preventivo salvato
// =====================================================================

/** ATTENZIONE: saveUuid, non quoteUuid. */
export async function getSave(cookie, saveUuid, fields = '__typename') {
  const d = await callPortal(
    `{ save(id: ${JSON.stringify(saveUuid)}) { ${fields} } }`,
    cookie, 'save'
  );
  return d.save;
}
