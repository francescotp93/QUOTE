# Contratto API v1 — IAM ↔ QUOTO ↔ Lab

Versione 1.0 — 17 agosto 2026. Approvato da Francesco.

> **A che serve questo documento.** È l'unico punto in cui la forma delle
> chiamate è definita. Se IAM e QUOTO se la ricordano ciascuno per conto suo,
> divergono alla prima aggiunta e nessuno se ne accorge finché un preventivo
> non esce sbagliato.

---

## 1. Il patto

**IAM non deve sapere quale prodotto sta chiamando per interpretare la
risposta.** Stessa forma per tutti, sempre — anche quando le cose vanno male.

Da questo discende tutto il resto: se un prodotto risponde a modo suo, IAM
ricomincia a contenere un ramo di codice per prodotto, che è esattamente ciò da
cui questa architettura sta scappando.

| servizio | cosa fa | cosa NON fa |
|---|---|---|
| **IAM** | orchestratore, storico, aggancio a cliente e trattativa | nessun calcolo, nessuno scraper |
| **QUOTO** | quotazione: tariffe e portali compagnia | non archivia dati cliente |
| **Lab** | calcolo puro: TFR, fondo pensione, IDD | non ha stato |

**Le costanti di calcolo vivono in un posto solo.** `COEFF_TFR`, `DED_MAX`,
`REND_FONDO` stanno in Lab e da nessun'altra parte. Lo stesso vale per le
tariffe: stanno in QUOTO.

---

## 2. Perché due tempi

Un prodotto a tariffa risponde in millisecondi. Uno che passa da un portale può
metterci minuti: la Casa HDI arriva a **~230 secondi** quando ripiega sul
browser, e il gateway taglia intorno ai 100.

Una POST che aspetta il risultato funzionerebbe per i primi e fallirebbe per i
secondi — e IAM dovrebbe sapere quali sono quali. **Accettando sempre e
consegnando dopo, la differenza sparisce dalla parte di IAM.**

```
POST /api/v1/quote/casa     → 202, ecco l'identificativo
GET  /api/v1/quote/{id}     → in_corso… in_corso… completo, ecco i premi
```

I prodotti a tariffa rispondono `completo` già alla prima GET. IAM fa sempre le
stesse due mosse.

---

## 3. Le chiamate

### `POST /api/v1/quote/{prodotto}`

```
Header:  X-Internal-Key: <chiave>
Body:    { dati specifici del prodotto }
```

**Risposta 202** — presa in carico:

```json
{ "success": true, "quote_id": "uuid", "prodotto": "casa",
  "stato": "in_corso", "risultati": [], "generato_il": "ISO8601" }
```

### `GET /api/v1/quote/{quote_id}`

`stato` è `in_corso` · `completo` · `fallito`. Quando è `completo`:

```json
{ "success": true, "quote_id": "uuid", "prodotto": "casa",
  "stato": "completo",
  "risultati": [
    { "compagnia": "HDI", "premio_annuo": 412.50, "premio_frazionato": 216.56,
      "frazionamento": "annuale|semestrale|mensile",
      "garanzie": [], "note": "" }
  ],
  "generato_il": "ISO8601" }
```

I sei campi del risultato **ci sono sempre**, anche se il provider ne
restituisce meno: IAM legge posizioni fisse, non «se c'è».

### `GET /api/v1/products`

```json
{ "success": true,
  "prodotti": [ { "codice": "casa", "attivo": true, "tipo": "quotazione" } ],
  "generato_il": "ISO8601" }
```

**Spegnere il motor si fa qui**, mettendo `attivo: false`. IAM se ne accorge da
solo: nessuna modifica dall'altra parte.

### Lab, stessa forma

```
POST /api/v1/analisi/tfr
POST /api/v1/analisi/idd
```

---

## 4. Gli errori

Elenco **chiuso**. IAM ci scrive sopra dei comportamenti, e un codice inventato
al volo diventa un ramo che nessuno ha previsto.

```json
{ "success": false,
  "error_code": "PROVIDER_UNAVAILABLE|INVALID_INPUT|TIMEOUT|AUTH_FAILED",
  "message": "descrizione leggibile",
  "provider": "hdi|null",
  "generato_il": "ISO8601" }
```

| codice | quando | cosa fa IAM |
|---|---|---|
| `AUTH_FAILED` | chiave interna mancante o sbagliata | si ferma, avvisa: è un guasto di configurazione |
| `INVALID_INPUT` | dati insufficienti, o prodotto inesistente | si ferma, mostra `message` all'operatore |
| `PROVIDER_UNAVAILABLE` | il portale non risponde, o è **frenato** | riprova, ma **solo dopo** `riprova_dopo` |
| `TIMEOUT` | il provider non ha risposto entro 240s | riprova più tardi |

### Il campo `riprova_dopo`

Quando lo scraper è **frenato** — dopo tre accessi falliti smette di bussare al
portale — la risposta porta `riprova_dopo` in ISO8601.

**Non è un dettaglio.** Senza, IAM ritenta subito e brucia i tentativi che
restano: e a quel punto è la compagnia a bloccare l'utenza dell'agenzia, che si
sblocca solo telefonando.

### Il dettaglio tecnico non esce

Il messaggio interno di un guasto può contenere indirizzi, tracce e frammenti di
pagina del portale. Chi chiama riceve un codice su cui può decidere; il dettaglio
resta nel log tecnico di QUOTO.

---

## 5. Autenticazione

Chiave condivisa in `X-Internal-Key`, da variabile d'ambiente `INTERNAL_API_KEY`
sui due lati. **Non il token dell'utente:** l'utente l'ha già autenticato IAM, e
rigirare qui la sua sessione vorrebbe dire che QUOTO deve saper leggere le
sessioni di IAM — un legame in più fra due servizi che stiamo separando.

Il confronto della chiave è a tempo costante: su un segreto condiviso il
confronto ingenuo lascia misurare quante lettere sono giuste.

**Se la chiave non è configurata, il router risponde 401 a tutto.** Meglio una
porta chiusa che una aperta per distrazione.

---

## 6. Dati e conservazione

Lo **storico** di quotazioni e analisi sta **in IAM**, agganciato a cliente e
trattativa. QUOTO e Lab tengono solo lavori in corso, in memoria, che scadono da
soli dopo un quarto d'ora.

**Un solo posto da presidiare per il GDPR: IAM.**

---

## 7. Ordine dei prodotti

1. **Casa** — fatto: è il banco di prova dell'architettura
2. RC professionale
3. Gli altri già tariffati: AmTrust, RC non regolamentate, Salute/LTC, Tutela
   legale, RC rischi diversi, Viaggio, Animali, Rischi catastrofali
4. **Motor** — fuori scope finché non esiste uno script che esegue una
   quotazione reale end-to-end e risponde passa/non passa da riga di comando

---

## 8. Dove vive il codice

| cosa | file |
|---|---|
| il contratto (router, involucro, errori) | `server/quoteApi.js` |
| gli adattatori per prodotto | `server/prodottiApi.js` |
| il montaggio | `server/index.js` → `app.use('/api/v1', …)` |
| le prove del contratto | `server/verifica/quote-api.test.mjs` |
| le prove del montaggio | `server/verifica/montaggio-api.test.mjs` |

> **Attenzione.** Nel repository c'è anche un `server.js` alla radice con una
> cartella `routes/` che espone `/api/v1/*`. **Non è avviato da nessuno**: la
> VPS lancia `server/index.js`. Implementare lì produrrebbe un endpoint che non
> risponde mai, senza nessun errore a dirlo. Una prova lo sorveglia.
