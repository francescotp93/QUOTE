# Prima — la porta che dal server si apre (`api.prima.it`)

Data della misura: 21/08/2026, dal server di produzione (IP 51.254.142.199).

## Il fatto

`intermediari.prima.it` è murato da Cloudflare per l'IP del nostro server:
**403 su tutto**, compresi `/favicon.ico` e `/robots.txt`. Nessun accesso
automatico può rimediare: è l'indirizzo a essere rifiutato all'ingresso.

Ma **`https://api.prima.it/graphql` dal nostro server risponde (200), senza
muro e senza login**. È un GraphQL con radice `RootQueryType` /
`RootMutationType`. L'introspezione completa è chiusa
("Introspection queries not allowed"), ma interrogando i singoli campi lo
schema si legge lo stesso dagli errori di validazione:

| campo | dove | esiste? |
|---|---|---|
| `fastQuote` | mutazione | **sì** — `CreateQuoteResponse!`, argomento `quote` |
| `quote(id: Uuid!)` | query | **sì** — `GetQuoteResponse`; su un id a caso risponde `{"quote":{"__typename":"QuoteError"}}`, **non** "unauthorized" |
| `cities(filter: PlaceCityFilter!)` | query | **sì** — `[City!]!` |
| `authorizeSalesFlow` | query/mutazione | **no** |
| `intermediary` / `agency` / `broker` / `network` / `agent` | query | **no** |

## Che cosa vuol dire

`api.prima.it` è l'**API pubblica (consumer)** di Prima — quella dietro
`www.prima.it`. Non ha `authorizeSalesFlow` (il passo con cui il portale
intermediari conia il token per la covers-api) né alcun campo di contesto
agenzia: `quote(id)` risponde direttamente, **senza autenticazione**.

Conseguenza pratica: da qui si può ottenere il **prezzo che vede un cliente
sul sito pubblico**, NON il prezzo intermediario (scontato, con la struttura
provvigionale dell'agenzia) che Withus vende. Sono due numeri diversi.

## A cosa serve / non serve

- **NON sostituisce** il flusso intermediari. Per il prezzo che l'agenzia
  vende serve ancora la sessione agente su `intermediari.prima.it`, che dal
  server resta murata (→ sblocco IP lato Prima, oppure proxy residenziale,
  oppure l'estensione nel browser dell'operatore).
- **Può servire** come *prezzo indicativo Prima dal sito pubblico*, calcolato
  dal server senza estensione e senza proxy — SE e solo se mostrato con
  un'etichetta che non lasci scambiare un prezzo consumer per un prezzo
  vendibile. Un prezzo troppo basso o troppo alto spacciato per quello di
  agenzia è esattamente l'errore peggiore in un preventivo.

## Perché non è già implementato

Per ottenere un prezzo bisogna eseguire una `fastQuote` reale (crea una
risorsa preventivo lato Prima, con dati anagrafici veri) e poi leggere
`quote(id)`. È una scrittura verso un servizio esterno e tocca dati di
persona: va fatta solo dopo l'ok di Francesco su DUE punti —
(1) un prezzo consumer indicativo serve davvero nel confronto? e
(2) è consentito eseguire quotazioni reali contro l'API pubblica?

La misura fatta finora è solo lettura dello schema: nessun preventivo creato,
nessun dato di cliente inviato.
