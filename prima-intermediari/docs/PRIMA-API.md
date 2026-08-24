# Prima Intermediari — mappa delle API interne

Ricostruita per osservazione diretta sul portale (introspection disabilitata).
Obiettivo: riutilizzare queste chiamate dentro **Quoto**.

---

## 0. I due endpoint (questo è il punto che sfugge)

Il portale NON ha un solo backend GraphQL. Ne ha **due**, e la tariffazione sta nel secondo:

| Endpoint | Cosa contiene |
|---|---|
| `POST /api/graphql` | portale: preventivi salvati, scadenzario, anagrafiche, sconto commerciale, dati del form |
| `POST /mfe/covers-api/graphql` | **micro-frontend "covers": garanzie, massimali, opzioni e PREZZI** |

Chi cerca la tariffazione solo su `/api/graphql` non la trova. È su `/mfe/covers-api/graphql`.

**Autenticazione: identica per entrambi — solo il cookie di sessione.**
Nessun bearer token, nessun header custom, nessuna firma. `credentials: 'include'` e basta.

---

## 1. Il funnel: dove si ferma un preventivo

Lo stadio si ricostruisce da `searchSavesNew` (endpoint `/api/graphql`) incrociando
`status` × `type`:

| `status` | Significato | Nel funnel |
|---|---|---|
| `PURCHASABLE` | calcolato, valido, acquistabile | **lead caldo** — è qui che si recupera |
| `DOCUMENTS_REQUIRED` | bloccato in attesa documenti | **attrito** — si sblocca con una telefonata |
| `PURCHASED` | convertito in polizza | conversione |
| `EXPIRED` | validità scaduta senza acquisto | perso |

`type`: `NEW_BUSINESS` (nuovo cliente) vs `RENEWAL_PROPOSAL` (proposta di rinnovo).
Da tenere separati: il drop-off su un rinnovo è un cliente che stai perdendo,
quello su new business è un preventivo che non hai chiuso. Sono due problemi diversi.

**Attenzione al buco strutturale:** questa API vede solo i preventivi **salvati**.
Un preventivo calcolato e abbandonato prima del salvataggio non esiste da nessuna parte.
Il funnel misurabile parte dal salvataggio, non dal calcolo — dichiaralo quando presenti i numeri.

Date utili al funnel: `createdAt` (calcolo), `effectiveDate` (decorrenza),
`expirationDate` (scadenza validità). `expirationDate - now` è la finestra di recupero.

---

## 2. Flusso di preventivazione — sequenza reale delle chiamate

### 2.1 `formConfiguration` — targa → veicolo + precompilazione (`/api/graphql`)

```graphql
query {
  formConfiguration(fetchFormConfigurationQuery: {
    plateNumber: "CB473HH"
    ownerBirthDate: "1971-03-14"
    inheritedAtrType: NO          # RC familiare: NO | ...
    insuranceType: BONUS_MALUS
    legalEntity: false
  }) {
    vehicleInfo {
      vehicleType weight
      availableFinitures { code name brandCode brandName modelCode kw displacement mass fuelFlag value }
    }
    useFastquote
    quoteData { ... }   # vedi sotto
  }
}
```

`plateNumber` e `ownerBirthDate` sono **obbligatori** (`String!`).

Restituisce il veicolo riconosciuto da targa **e** `quoteData`, cioè il modello dati
completo del preventivo, in gran parte già precompilato:

- `vehicle`: type, registrationDate, purchaseDate, powerSource, plateNumber, ownUse,
  brandCode, modelCode, finitureCode, kw, displacement, yearMileage, hasLoan, loan*, activity
- `owner` / `driver` / `contractor` / `inheritedOwner` — stessa forma:
  firstName, lastName, gender, fiscalCode, birthDate, birthCity, birthCountry, bornAbroad,
  civilStatus, occupation, licenseYear, noLicense, vat, companyName, companyType,
  residential* (address, civicNumber, city, cap), domiciliary*, residenceIsDomicile
- `atr` / `inheritedAtr` — **l'attestato di rischio**:
  `toRiskCategory` (classe di merito), `toInternalRiskCategory`,
  `details[]` per anno: `principale`, `paritario` (pre-2015) oppure
  `principaleCose/Persone/Mista` e `paritarioCose/Persone/Mista` (dal 2015)
- `guideType`, `effectiveDateDate`, `effectiveDateTime`, `whoIsDriver`,
  `contractorIsOwner`, `phoneNumber`, `privacyAll`, `conventionDiscountCode`, `originalSaveId`

> `conventionDiscountCode` è il gancio per le **convenzioni**: il codice sconto
> viaggia nel preventivo. Se in Quoto gestisci convenzioni, è il campo da popolare.

### 2.2 Anagrafiche di supporto (`/api/graphql`)

```graphql
{ countries { name landRegister } }
{ brands(fetchBrandsQuery: { vehicleType: CAR, vehicleRegistrationDate: "1994-06-01" }) { ... } }
{ cities(date: "2026-08-20", filter: "marsala") { name province istat zipCodes { zip } } }
```

`cities` è l'autocomplete comuni: restituisce ISTAT e CAP — usabile direttamente
come servizio di normalizzazione indirizzi dentro Quoto.

### 2.3 `authorizeSalesFlow` — token per il micro-frontend (`/api/graphql`)

```graphql
{ authorizeSalesFlow(resourceId: "<quoteUuid>", resourceType: QUOTE) { token } }
```

Chiamata subito prima di caricare le garanzie. Da replicare nella stessa sequenza.

### 2.4 `Quote` — LA tariffazione (`/mfe/covers-api/graphql`)

```graphql
query Quote($id: UUID!) {
  quote(id: $id) {
    __typename
    ... on Quote {
      installmentPrices {
        canBeSaved earlyDiscountExpirationDate earlyDiscountRemainingDays
        installments {
          installmentConfiguration {
            slug unit size count automaticPayments selected
            labels { name payment period periodInMonths }
          }
          guarantees {
            slug label selected isMandatory weight availabilityConstraints
            dependencies exclusions requiredGuarantees
            description { bundle detail full optionsDescriptions }
            convention { label unit value }
            optionGroups {
              label mandatory type
              ... on PriceBooleanOptionGroup { option { slug selected type description { full label } metadata { name value } } }
              ... on PriceListOptionGroup { options { slug selected type limits { key value } description { full label } metadata { name value } } }
            }
            priceBlocks {
              isRefund
              coveragePrice {
                legal presentation full min max
                flexibilityMax taxesPercentage
                bundleDiscount earlyDiscount riparaPrimaDiscount companyTax
              }
              adjustmentCoveragePrice { legal presentation full companyTax }
              relatedOptions { slug type guaranteeSlug }
            }
          }
        }
      }
      issuingCompany { slug label name completeName card }
      messages { code metadata { name value } }
      tariff selected
      atrDetails {
        year
        ... on AtrDetail2015    { principaleCose principaleMista principalePersone paritarioCose paritarioMista paritarioPersone }
        ... on AtrDetailPre2015 { principale paritario }
      }
      toRiskCategory insuredYears totalNumberOfClaims
      guideType effectiveDate isSubstitution contractorIsOwner
      vehicle {
        ... on Car        { plateNumber brandName modelName finitureName registrationDate purchaseDate powerSource kw displacement marketValue ownUse yearMileage yearMileageLabel type loan { company type expirationDate } }
        ... on Motorcycle { ...idem }
        ... on Van        { ...idem + activity }
      }
      owner      { ... on NaturalPerson { firstName lastName gender fiscalCode birthDate birthCityName birthProvinceCode civilStatus occupation qualification licenseYear noLicense residentialAddress { address addressNumber cityName provinceCode provinceName } homeAddress { ... } homeAddressEqualResidentialAddress }
                   ... on LegalPerson  { companyName companyType vat registeredOffice { ... } fieldOffice { ... } registeredOfficeEqualFieldOffice } }
      driver     { ...stessa union }
      contractor { ...stessa union }
      id substitutionReasons
    }
    ... on QuoteError { error }
  }
}
```
Variabili: `{"id": "<quoteUuid>"}`

Questa singola query restituisce **tutto**: ogni garanzia disponibile con prezzo,
massimali selezionabili, dipendenze/esclusioni fra garanzie, classe di merito,
storico sinistri, dati veicolo e anagrafiche. Risposta reale osservata: ~114 KB.

### 2.5 `rewardedFlexibility` — sconto commerciale (`/api/graphql`)

```graphql
{
  rewardedFlexibility(addOnCoversSelection: {
    addOnCovers: [{ slug: "rca", amount: 41720, technicalPrice: 41720 }]
  }) { ... }
}
```

Quanto sconto l'agenzia può applicare su quella combinazione di garanzie.
Il plafond residuo è su `/api/graphql`: `quote(id:) { availableFlexibility flexibilityDiscountEnabled }`.

---

## 3. ⚠️ Le unità di misura NON sono coerenti fra i due endpoint

Questo è l'errore che ti costa un bug economico in produzione:

| Endpoint | Formato | Esempio osservato |
|---|---|---|
| `/mfe/covers-api/graphql` | **stringa in euro** | `"591.09"` = 591,09 € |
| `/api/graphql` → `rewardedFlexibility` | **intero in centesimi** | `41720` = 417,20 € |

Normalizza **in ingresso**, una volta sola, al confine del client. Non lasciare
che due unità diverse circolino dentro la logica di Quoto.

### Quale campo è "il prezzo"

Su `coveragePrice`:

- **`legal`** → il premio effettivo, quello da mostrare e da usare nei conti
- `presentation` → prezzo di listino mostrato barrato
- `full` → prezzo pieno senza sconti
- `min` / `max` / `flexibilityMax` → estremi entro cui può muoversi lo sconto commerciale
- `bundleDiscount`, `earlyDiscount`, `riparaPrimaDiscount` → sconti applicati
- `taxesPercentage`, `companyTax` → fiscalità

Sul portafoglio (`searchSavesNew`, altro endpoint) il premio è invece
`Σ installmentPrices[].coverageAmounts.legal` — **verificato**: 140,33 + 70,00 = 210,33 €,
identico alla UI.

> **Da verificare prima di andare in produzione:** in una sessione di test il totale RCA
> in UI (527,76 €) non coincideva con `coveragePrice.legal` (591,09 €), plausibilmente
> perché il preventivo era stato ricalcolato con parametri diversi o con flessibilità
> applicata. Prima di fidarti dei numeri in Quoto, riconcilia legal + sconti con
> il totale a schermo su almeno 3 preventivi reali di rami diversi.

---

## 4. Altre API utili già mappate

```graphql
# Scadenzario (/api/graphql)
query dashboardInitialData {
  deadlines(filter: {
    date: { isMonth: 8, isYear: 2026 }
    deadlineType: { in: [MOTOR_INSURANCE, ...] }
  }) { ... }
}

# Preventivo salvato (/api/graphql) — union Save | SaveError
{ save(id: "<saveUuid>") { __typename } }

# Ricerca preventivi (/api/graphql)
searchSavesNew(
  limit: Int
  status: { in: [PURCHASABLE | PURCHASED | EXPIRED | DOCUMENTS_REQUIRED] }
  productType: MOTOR | HOME
  saveCode: { is: "PR1234567" }
  referenceCode: { contains: "AB123CD" }   # targa
  contractor: { ... }
)

# Autocomplete contraenti (/api/graphql)
{ searchAutocompleteContractors(searchContractorInput: { on: SAVES, name: { contains: "rossi" } }) { ... } }
```

**Due identificativi diversi, non confonderli:**

- `saveUuid` → `/preventivi/{saveUuid}` — il preventivo **salvato**
- `quoteUuid` → `/quotazioni/{quoteUuid}/garanzie` — la **quotazione** in corso

`save(id:)` accetta il primo, `quote(id:)` il secondo. Scambiarli dà
"la risorsa non è stata trovata", che sembra un problema di permessi e non lo è.

---

## 5. Dove trovi l'email del cliente

`searchSavesNew` **non** espone email né telefono (36 campi candidati testati).
I contatti stanno altrove:

- `quote(id:) { email }` su `/api/graphql`
- `phoneNumber` dentro `formConfiguration.quoteData`

Quindi per una campagna di recupero servono **due passaggi**: prima la lista da
`searchSavesNew`, poi un `quote(id:)` per ciascun preventivo da contattare.
Con l'API lenta come è, questo va fatto in batch notturno, non a richiesta.

---

## 6. Vincoli operativi, da rispettare in Quoto

- **`/api/graphql` è lento**: 45–60 s sulle query di portafoglio ampie, e sopra
  ~600 record risponde HTML di errore invece che JSON. Gestisci il caso non-JSON:
  è un timeout backend travestito da risposta valida.
- `/mfe/covers-api/graphql` è invece rapido (query su singola quotazione).
- **MFA sul login**: risolvibile solo col device trust di 30 giorni
  ("Ricorda questo dispositivo"). Vedi il README dello scraper.
- **Nessun parallelismo aggressivo**: 4 query concorrenti hanno peggiorato i tempi
  di tutte. Serializza con una pausa fra le chiamate.
- **Introspection disabilitata**: se Prima cambia lo schema non c'è modo di
  accorgersene se non rompendosi. Metti un healthcheck che esegua una query nota
  e allerti sul primo errore GraphQL, invece di scoprirlo dai dati mancanti.

---

## 7. Nota di sostanza, non tecnica

Queste sono API interne non documentate né supportate: possono cambiare senza
preavviso e il loro uso automatizzato può ricadere nelle condizioni contrattuali
Prima. Vale la pena verificarlo prima di costruirci sopra un processo di agenzia,
e vale ancora di più chiedere a Prima se esiste un accesso API ufficiale per gli
intermediari: se c'è, quello è il canale su cui costruire Quoto, non questo.
