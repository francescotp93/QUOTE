// ---------------------------------------------------------------------
// Query GraphQL ricostruite dal portale Prima Intermediari.
//
// Endpoint: POST https://intermediari.prima.it/api/graphql
// Auth:     solo cookie di sessione (nessun header custom, nessun bearer)
// Introspection: DISABILITATA in produzione (__schema -> null)
//
// Argomenti validi su searchSavesNew (scoperti per probing):
//   limit         : Int
//   status        : StatusInput      -> { in: [SearchStatusFilter!] }
//   productType   : ProductType      -> MOTOR | HOME
//   saveCode      : TextInput        -> { is: "PR1234567" }
//   referenceCode : TextInput        -> { contains: "DC55500" }   (targa)
//   contractor    : TextInput
//
// Valori enum SearchStatusFilter validi:
//   PURCHASABLE | PURCHASED | EXPIRED | DOCUMENTS_REQUIRED
//   NOTA: PURCHASED non e' esposto dai filtri della UI ma l'API lo accetta.
//         E' quello che permette di calcolare il conversion rate reale.
//
// Comportamento di `limit` (misurato): il server restituisce
//   min(2 * limit, limit + 10) record, fino a esaurimento del dataset.
//   Quindi il limite va sempre trattato come "almeno", mai come "esattamente".
// ---------------------------------------------------------------------

const PRICE = 'earlyDiscount presentation legal full';

/** Query completa di un segmento (status + productType). */
export function searchSavesQuery({ status, productType, limit }) {
  const args = [];
  if (limit) args.push(`limit: ${limit}`);
  if (status) args.push(`status: {in: [${[].concat(status).join(', ')}]}`);
  if (productType) args.push(`productType: ${productType}`);
  const argStr = args.length ? `(${args.join(', ')})` : '';

  return `query {
  searchSavesNew${argStr} {
    uuid
    quoteUuid
    code
    reference
    type
    status
    createdAt
    effectiveDate
    expirationDate
    createdByMassQuote
    hasFlexibilityApplied
    mailIntermediario
    contractor { companyNameOrFullName }
    productData {
      __typename
      ... on SearchItemProductMotorData {
        colorCase
        tariff
        guideType
        isSubstitution
        earlyInstallmentDiscountExpirationDate
        vehicle { vehicleType }
        installmentConfiguration { labels { periodInMonths period payment name } }
        installmentPrices {
          name slug label selectedAvailabilityConstraint
          options { slug }
          coverageAmounts { ${PRICE} }
          adjustmentAmounts { ${PRICE} }
        }
      }
      ... on SearchItemProductHomeData {
        productType
        property {
          __typename
          ... on SearchHomeApartmentProperty { address { zipCode istat city streetNumber streetAddress } }
          ... on SearchHomeHouseProperty    { address { zipCode istat city streetNumber streetAddress } }
        }
        selection {
          paymentFrequency
          issuingCompany { slug }
          fullPrice { taxes net amount }
          packages {
            slug label
            price { taxes net amount }
            fullPrice { taxes net amount }
            clusters {
              label
              guarantees { label price { taxes net amount } fullPrice { taxes net amount } }
            }
          }
        }
      }
    }
  }
}`;
}

/** Query leggerissima: serve solo per capire se la sessione e' ancora viva. */
export const HEALTHCHECK_QUERY = '{ searchSavesNew(limit: 1) { uuid } }';
