# Allianz Motor (Matrix) — Preventivo Motor / fast-quote

Mappatura del flusso preventivo auto di Allianz Matrix, ricavata guidando lo scraper
(`scraper/allianz/quote-service.mjs`, endpoint `/motor`) e catturando il traffico
(`server/allianz-cattura.json`). Giugno 2026.

## Come si apre

- Portale SPA Angular: `https://portaleagenzie.allianz.it/matrix/`
- Menu **Sales** → voce **"Preventivo Motor"** (componente `<lib-da-link>` → `<a>` interno).
  - bookmark: `link:"/assuntivomotor/fast-quote"`, `internal:true`, `openInIFrame:true`,
    `agencySelectionNeeded:true`, account `ARALOMBARDO2`, agenzia `920000`/compagnia `1`/sub `0`.
- Aprendolo, Matrix carica `/matrix/sales/legacyda?daToken=...` con DENTRO un **iframe**:
  `https://portaleagenzie.allianz.it/assuntivomotor/fast-quote`
- Navigare l'URL secco NON funziona (serve il contesto agenzia passato dal click → iframe vuoto
  "Torna indietro").

## Il driver `/motor` (scraper, porta 4200)

- `/motor?step=open&sniff=1` → va su Sales, clicca Preventivo Motor, apre l'iframe, mappa i frame.
- `/motor?step=quote&targa=..&nascita=GG/MM/AAAA&calcola=1` → compila targa + data nascita
  proprietario nell'iframe (selettori **posizionali**: gli id `nx-input-N` sono dinamici!),
  spunta l'informativa privacy, clicca **CALCOLA**.
- `/motor?step=type&sel=..&val=..` / `?step=click&text=..` → passi manuali nell'iframe attivo.
- `/motor?step=dump` → solo stato attuale.

## API REST dell'app assuntivomotor (NON GraphQL)

Base: `https://portaleagenzie.allianz.it/assuntivomotor/`

| Metodo | Endpoint | Funzione |
|---|---|---|
| POST | `/common/api/authorization/init/MOCK/BLANK` | init sessione/autorizzazione |
| GET  | `/quote/api/dati-quotazione` | **modello** del form (vedi sotto) |
| PUT  | `/quote/api/dati-quotazione/controlli/Targa` | imposta targa → lookup veicolo |
| PUT  | `/quote/api/dati-quotazione/controlli/DataNascitaProprietario` | data nascita proprietario |
| PUT  | `/quote/api/dati-quotazione/controlli/Calcola?forced=false` | CALCOLA → premio (o 400 se incompleto) |
| GET  | `/parties/api/anagrafiche/contraenti-proprietari` | anagrafica contraenti/proprietari |
| GET  | `/common/api/debug/debug-info` ; `/assets/i18n/ultra_it-IT.json` | contorno |

### Modello `GET /quote/api/dati-quotazione`
Forma "a frase": array `controlli` di elementi testo `{"valore":"..."}` o campi:
```json
{"id":"TipoVeicolo","valore":"050000","tipo":"dropdown","opzioni":[
  {"descrizione":"un'auto","chiave":"050000"},
  {"descrizione":"una moto","chiave":"602010"},
  {"descrizione":"un autocarro","chiave":"501216"},
  {"descrizione":"un altro veicolo","chiave":"999999"}]}
{"id":"Targa","valore":"","tipo":"...","facoltativo":false}
```
Altri controlli noti: `DataNascitaProprietario`, `Calcola`. Proprietario di default = persona fisica.

### Set di un campo
`PUT /controlli/<IdCampo>` con body `{"valore":"<valore>","id":"<IdCampo>"}` → `{"message":"","result":true}`.
Esempio targa: `{"valore":"GY263BY","id":"Targa"}`.

### CALCOLA
`PUT /controlli/Calcola?forced=false`. Con solo targa+nascita restituisce **400** e l'app passa al
**wizard 4-step**: `1 Contraente/Proprietario → 2 Veicolo → 3 Provenienza → 4 Offerta`
(il premio "alla firma" è nello step 4). Lo step Contraente richiede anagrafica completa:
CODICE FISCALE/P.IVA, NOME, COGNOME/RAG. SOCIALE, SESSO, DATA NASCITA, COMUNE NASCITA,
INDIRIZZO/CIVICO/CITTÀ/CAP/PROVINCIA → **AVANTI**.

## TODO per il quotatore completo
1. Completare il wizard via `controlli` (o via UI) fino allo step **Offerta** catturando il premio.
2. Mappare gli id dei campi anagrafica/veicolo/provenienza/garanzie (una cattura di UN preventivo
   reale completo li elenca tutti).
3. Idealmente: replicare la sequenza REST `controlli/*` direttamente (più veloce della UI), riusando
   i cookie di sessione dell'iframe (authorization/init + daToken).
4. Pre-compilare l'anagrafica dal CF reale (recuperabile dalla Banca Dati ANIA già integrata).
