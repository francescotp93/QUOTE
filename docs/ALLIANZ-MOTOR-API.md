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

## Garanzie dell'offerta — `GET /quote/api/offerta/sezioni`

Verificato su cattura del portale (settembre 2026). La risposta è
`{sezioni:[{nome, premio, garanzie:[...]}], segnalazioni:{segnalazioni:[]}}` e dentro convivono
**due famiglie di oggetti**, che si comandano con la stessa PUT ma con corpi diversi:

- **garanzia** — ha `stato:{id, selezionato, visibile, abilitato}` e un premio. È la voce che si
  accende e si spegne (Incendio, Furto, Assistenza, Infortuni...).
- **clausola** — sta dentro `garanzia.clausole[]`, ha `tipoExpo` (il campo con `tipo`, `valore`,
  `opzioni`). È il parametro della garanzia (massimale, tipo guida, capitale infortuni...).

> Finché una garanzia è spenta il suo id è "tronco" (`7200-`) e **non ha clausole con `tipoExpo`**:
> cercarla per `tipoExpo` non la trova mai. Appena accesa l'id diventa completo (`7200-7240`) e
> compaiono le clausole.

### Grammatica delle PUT
```
PUT /quote/api/offerta/garanzia/<id>/<true|false>
```
- il **suffisso** dell'URL vuol dire "garanzia selezionata sì / no";
- il **corpo** è il `tipoExpo` della clausola con il `valore` nuovo, **oppure `{}`** quando si
  accende/spegne la garanzia intera;
- risposta `{"message":"Operation success. Aggiornamento garanzie effettuato.","result":true}`:
  guardare `result`, non solo l'HTTP 200. Ogni PUT dura 1,1-1,6 s ed è sincrona: dopo ognuna
  conviene rileggere `offerta/sezioni` (il portale ricalcola premi e id).

### Id noti

| Sezione | Garanzia (id) | Clausola (id) | Tipo | Valori |
|---|---|---|---|---|
| Rc Auto | `1000-1530` RCA Bonus Malus | `1500-200` Massimale | dropdown | `563064501300` 6,45M/1,3M · `553000010000` 10M/10M · 25M/25M |
| | | `1500-210` Classe di premio | avviso | sola lettura |
| | | `1500-240` Conducente/Tipo Guida | dropdown | `000000000001` libera · `000000000002` esperta |
| | | `1500-251` Protezione Rivalsa | accordion | `"true"` / `"false"` |
| | | `1500-252` Urto con veicoli non identificati | accordion | `"true"` / `"false"` |
| | | `1500-265` Accordo risarcimento in forma specifica | accordion | `"true"` / `"false"` |
| | | `1500-280` Indennità danno totale RCA | accordion | `"true"` / `"false"` |
| Auto Rischi Diversi | `2000-` → `2000-2010` / `2000-2020` Incendio | `2233-059` IVA agevolata · `2233-065` Estensione atti vandalici | dropdown | **a volte pre-inclusa** (quando il portale conosce il valore del veicolo) |
| | `3000-` → `3000-3010` Furto | `3000-3010` Tipo (7 varianti) · `2243-079` IVA · `2243-130` Scoperto · `2243-140` Minimo | dropdown | **a volte pre-inclusa**: dipende dall'Incendio |
| | `4000-` → `4000-4010` Tutela Giudiziaria | — | — | garanzia secca, spenta di default |
| | `5000-` → `5000-5150` Atti Vandalici / Eventi Naturali | `1234-059` IVA · `1234-090` Scoperto · `1234-100` Minimo | dropdown | **una sola garanzia per due caselle di QUOTO** |
| | `4200-42xx` Assistenza Auto (`4200-4209`) | `4200-4209` Tipo (`000000004209` base · `000000004211` a seguito di incidente) | dropdown | **pre-inclusa** dal portale |
| | `4350-4351` Rapid Repair | — | — | **pre-inclusa** |
| | `6300-6315` Imprevisti da Circolazione | `1257-020`, `1257-079` | dropdown/avviso | **pre-inclusa** |
| | `6500-` Kasko | — | — | spenta di default |
| | `7200-` → `7200-7240` Infortuni del Guidatore | `2225-010` invalidità permanente · `2225-020` morte · `2225-030` indennità da ricovero | valuta | default **200.000** → il pacchetto base QUOTO è `31000`/`31000` |
| | `7600-` Spese mediche macrolesioni | — | — | spenta di default |
| | `5300-` Garanzie Aggiuntive | — | — | contenitore |

I tre ARD pre-inclusi sono un pacchetto: `PUT garanzia/4200-4209/false` con corpo `{}` li toglie
tutti e tre in un colpo (sezione Auto Rischi Diversi da ~114 € a 0).

Dipendenze osservate fra garanzie (seconda cattura):

- **il Furto dipende dall'Incendio**: spegnendo `2000-2010` sparisce anche `3000-3010`. Chi chiede
  il furto deve quindi tenersi l'incendio;
- **spegnere l'Assistenza Auto spegne anche gli Imprevisti da Circolazione** (Rapid Repair e
  Imprevisti si possono comunque spegnere anche uno per uno);
- accendere una famiglia non dà la variante che ci si aspetta (`2000-/true` ha acceso `2000-2020` a
  107,59 €, mentre nel pacchetto di default c'era `2000-2010` a 53,80 €), e le garanzie si
  influenzano il prezzo a vicenda: **dopo ogni PUT si rilegge `offerta/sezioni`**.

### Pacchetto esclusivo (`ALLIANZ_MOTOR_ESCLUSIVO`)

L'offerta può arrivare con garanzie già dentro che il cliente non ha chiesto: gli Auto Rischi
Diversi (~114 €/anno) e, quando Allianz conosce il valore del veicolo, anche Incendio e Furto
(~583 €/anno nella seconda cattura). Lo scraper le spegne, con le stesse cautele usate su HDI: mai
la RCA (famiglia `1000-`), mai una garanzia che il portale marca `abilitato: false` o
`visibile: false`, e se in quell'offerta non riconosce nessuna delle garanzie richieste **non
spegne niente** e lo scrive nel log (meglio un premio caro che un preventivo senza coperture).
`ALLIANZ_MOTOR_ESCLUSIVO=0` riporta al comportamento di prima. Oggi lo scraper **spegne** il non
richiesto ma **accende** solo gli infortuni del conducente: accendere le altre garanzie accessorie
scelte in QUOTO è il passo successivo, non ancora fatto.

## Sconto area riservata (CMC)

Base: `/assuntivomotor/custom/api/area-riservata/inserimento-manuale/`

| Metodo | Endpoint | Funzione |
|---|---|---|
| GET | `carica` | stato degli sconti: `riduzioniRCA.{scontoDigital, riduzioneTecnica, cmc, scontoMassimo}`, `segnalazioni.segnalazioni[]` |
| PUT | `salva-cmc/RiduzioneCMC/<perc>percentuale` | imposta la riduzione CMC. Risponde `{"message":"Nuovo valore recepito.","result":true}` |
| PUT | `aggiorna` | conferma (risponde `{}`); da qui lo sconto si vede solo nell'**anteprima** `carrello/true` |
| PUT | `pagina/salva` | **chiude confermando** (risponde la stringa `"offerta"`): senza questo passo lo sconto sparisce |
| PUT | `pagina/annulla` | annulla la pagina (quello che fa l'operatore quando c'è un bloccante) |

Formato di `<perc>`: **intero** quando è intero (`5percentuale`, `50percentuale`), **virgola
URL-codificata** con i decimali (`20%2C25percentuale`). Entrambi osservati nella seconda cattura
del 10/09/2026.

Il massimo concedibile all'agenzia sta in
`riduzioniRCA.cmc.riduzione.percentuale.massimoAge` (es. `"5"`). **Attenzione**: accanto c'è
`riduzione.importo.massimoAge`, che è un **importo in euro** (es. `"31,68"`): scambiarlo per una
percentuale fa chiedere sconti impossibili.

Sequenza completa di uno sconto andato a buon fine (seconda cattura):
`carica` → `salva-cmc/RiduzioneCMC/<perc>percentuale` → `carica` (controllo bloccanti) → `aggiorna`
→ `carica` → **`pagina/salva`**. La **prova del nove** è la comparsa, nella RCA, della clausola
`1500-500 Scontistica` con la percentuale applicata (es. `"50,00%"`): prima dello sconto non c'è.

Dopo `salva-cmc` va riletto `carica`: se compaiono segnalazioni con `livello:"bloccante"`
(tipica: *"Monte sconti CMC esaurito. Necessaria assegnazione/disassegnazione."*) lo sconto **non**
è stato concesso e la pagina va annullata. Nella cattura disponibile lo sconto fallisce sempre per
plafond esaurito; nella seconda un primo tentativo al massimo dichiarato (20,25%) è stato respinto
con *"Sconto eccessivo"* e *"Plafond insufficiente"* — l'importo corrispondente sforava il tetto in
euro di un centesimo. Chiedere meno del massimo (lo scraper chiede la metà) è la scelta prudente.

## Parametri dell'endpoint `/premio`

`targa`, `nascita`, `tipo`, `bersani`, `guida|tipoGuida`, `massimale`, e gli interruttori di
pacchetto: `infortuni` (default 1: il backend lo tiene acceso salvo richiesta esplicita `infortuni:0`,
perché l'interfaccia oggi non permette di toglierlo), `assistenza` (default 0 = toglie i tre ARD pre-inclusi),
`rivalsa` (default 1 = Protezione Rivalsa a Sì, come il pacchetto base di QUOTO).
Le `garanzie` scelte in QUOTO arrivano come elenco di chiavi (`garanzie=incendio,furto_totale_parziale,...`)
e decidono cosa resta acceso nel pacchetto esclusivo; le chiavi senza corrispondenza nota
(cristalli, collisione) vengono scritte nel log e mai indovinate.
Nella risposta: `pacchetto_base` (esiti delle PUT: `massimale`, `guida`, `rivalse`,
`risarcimento`, `ard_rimossi` [`null` = niente da togliere, `true` = tolti, `false` = ne resta uno],
`infortuni`, `infortuni_31k` [dal valore riletto], `esclusivo` [se lo spegnimento è stato applicato],
`garanzie_spente`, `garanzie_protette` [flag del portale], `garanzie_non_spente` [il portale ha
rifiutato]) e `sconto_area_riservata` (`{applicato, percentuale, massimo, scontistica}` oppure
`{applicato:false, motivo}`, con eventuale `avviso` se salvato ma la clausola Scontistica non compare).
Interruttore d'emergenza: `ALLIANZ_MOTOR_ESCLUSIVO=0` ripristina il comportamento di prima della patch,
cioè **nessuno spegnimento**, nemmeno degli ARD (`assistenza=0` diventa inefficace).

## Stato dell'integrazione

Fatto (verificato sul codice, settembre 2026):
1. **Backend**: `server/moto.js` proxa allo scraper — `POST /moto/preventivoAllianz/start` +
   polling su `/status/:jobId` (il fast-quote può durare ~225 s), oltre al sincrono
   `/allianz-auto` per retro-compatibilità.
2. **Frontend**: Allianz è una fonte del preventivo auto (`awPremioAllianz` in `index.html`,
   card premio + dettaglio garanzie).
3. `TipoVeicolo` viene impostato esplicitamente via `PUT controlli/TipoVeicolo`
   (auto `050000`, moto `602010`, autocarro `501216`) prima della targa.

Ancora aperto:
4. **Velocità**: targa, data di nascita e Calcola ancora digitati e cliccati; farli come tre PUT
   REST `controlli/*` toglierebbe 10-20 s e i selettori posizionali fragili.
5. **Premio**: leggerlo da `GET offerta/carrello/false` (`prezzoTotale`, `prezzoRC`,
   `prezzoRischiDiv`) invece che dal pacchetto `selezionato` di `soluzioni`.
6. **Segnalazioni bloccanti** di `offerta/sezioni` e `quotazioneNonCompetitiva` della sintesi: oggi
   non vengono lette, quindi un premio "strano" non produce nessun avviso.
7. **Mappa completa delle garanzie** QUOTO → Allianz (Incendio, Furto, Tutela, Kasko,
   Macrolesioni): oggi si comandano solo infortuni e Auto Rischi Diversi.
8. **Persona giuridica / ditta** (`TipoProprietario` 2 e 3) e **frazionamento semestrale**.
9. **Targa non identificata**: se il portale non riconosce il veicolo, `controlli/Calcola` risponde
   400 e nel `dati-quotazione` successivo `Calcola.valore` diventa `"VEICOLO"`: si apre una
   procedura guidata (marca → modello → versione → posti → valore) più la polizza precedente. Lo
   scraper oggi non lo riconosce: aspetta un'offerta che non arriverà e va in timeout senza
   spiegare. Riconoscere il caso e rispondere con un messaggio onesto è un lavoro a parte.
10. **Convenzioni di agenzia** (`PUT offerta/salva-convenzione/<codice>`): alzano il tetto di sconto
   ma **azzerano le garanzie già scelte** e consumano un contingente. Scelta commerciale: non
   automatizzare senza una regola di Francesco.
