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

## ✅ QUOTATORE FUNZIONANTE — endpoint `/premio` (scraper porta 4200)

Scoperta chiave: per il **preventivo** NON serve completare il wizard a 4 step. Bastano
targa + data di nascita del proprietario → `Calcola` salta direttamente allo step **Offerta**
e il premio si legge dalle REST. Il driver `quotaMotor(targa, nascita)` fa:

1. apre il Preventivo Motor dal menu Sales (click sull'`<a>` dentro `lib-da-link`)
2. compila targa (primo input testo) + data nascita (placeholder `GG/MM/AAAA`) + spunta privacy
3. clicca **CALCOLA** → atterra su `/assuntivomotor/preventivo/offerta`
4. nel frame offerta esegue `fetch('/assuntivomotor/quote/api/offerta/sintesi-offerta')` e
   `.../offerta/soluzioni` (stessa sessione, `credentials:include`) e fa il parsing.

### Endpoint
`GET http://127.0.0.1:4200/premio?targa=AB12345&nascita=GG/MM/AAAA`
```json
{
  "ok": true,
  "premio_annuale": 497.7,
  "pacchetto": "Full — RC Auto e Auto Rischi Diversi",
  "classe_cu": "1 B/M",
  "tipo_veicolo": "Altro veicolo",
  "decorrenza": "07/07/2026", "scadenza": "07/07/2027",
  "frazionamenti": ["annuale","semestrale"],
  "garanzie": [
    {"formula":"Bonus Malus","sigla":"Full","descrizione":"RC Auto e Auto Rischi Diversi","premio":497.7,"selezionato":true},
    {"formula":"Nuova 4R","sigla":"Full","premio":450.7}
  ]
}
```
Testato OK su GY263BY (17/07/1993): Bonus Malus 497,70 € / Nuova 4R 450,70 €.

### Strumenti di sviluppo del driver (endpoint `/motor`)
`/motor?step=open|quote|contraente|click|type|probe|dump` — usati per mappare il flusso; restano
utili per debug. La cattura sniffer (`/sniff/start` · `/sniff/stop`) salva in `server/allianz-cattura.json`.

## TODO per chiudere l'integrazione (#12)
1. **Backend**: route che proxa a `http://127.0.0.1:4200/premio` (come `moto.js` per ANIA).
2. **Frontend**: aggiungere Allianz come fonte nel flusso preventivo auto (card premio + garanzie).
3. Rifinitura: impostare esplicitamente `TipoVeicolo` (auto=050000) via `PUT controlli/TipoVeicolo`
   per evitare il default "Altro veicolo"; gestire moto/autocarro; persona giuridica.
4. Velocità: valutare la replica diretta delle REST `controlli/*` (senza UI) riusando la sessione.
