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
  "error_code": "PROVIDER_UNAVAILABLE|INVALID_INPUT|TIMEOUT|AUTH_FAILED|NOT_FOUND|FORBIDDEN",
  "message": "descrizione leggibile",
  "provider": "hdi|null",
  "generato_il": "ISO8601" }
```

| codice | quando | cosa fa IAM |
|---|---|---|
| `AUTH_FAILED` | chiave interna mancante o sbagliata | si ferma, avvisa: è un guasto di configurazione |
| `INVALID_INPUT` | i dati mandati non bastano o non vanno bene | si ferma, mostra `message` all'operatore |
| `NOT_FOUND` | il prodotto, la quotazione o la fonte non esistono | si ferma, non riprova: riprovare non li farà comparire |
| `FORBIDDEN` | operazione permessa, ma non con questi permessi (manca `X-Operatore`) | si ferma, avvisa: è un guasto di configurazione |
| `PROVIDER_UNAVAILABLE` | il portale non risponde, o è **frenato** | riprova, ma **solo dopo** `riprova_dopo` |
| `TIMEOUT` | il provider non ha risposto entro 240s | riprova più tardi |

`NOT_FOUND` e `FORBIDDEN` sono entrati il **20/08/2026** con le API delle Fonti.
Prima «questa cosa non esiste» usciva come `INVALID_INPUT`, cioè «i dati che mi
hai mandato sono sbagliati»: mandava a controllare i dati quando il problema era
un altro. Sono due decisioni diverse per chi legge, e adesso sono due codici.

**La lista è chiusa davvero:** un codice fuori lista non esce dall'involucro,
diventa `PROVIDER_UNAVAILABLE`. Una prova confronta la lista con quella
concordata, così aggiungerne uno obbliga a passare da lì — e quindi a dirlo.

### Il premio esce grezzo, non arrotondato

`premio_annuo` è il numero **come lo produce la tariffa**, senza arrotondamenti:
`222.19438725`, non `222.19`.

Deciso da Francesco il 17/08/2026, ed è la scelta giusta perché **è IAM che deve
stampare il premio**. Se arrotondasse QUOTO, IAM riceverebbe un numero già
tagliato e non potrebbe più fare somme, frazionamenti o rate senza trascinarsi
dietro l'errore del taglio. Arrotondare una volta sola, alla fine, è l'unico
modo di non far comparire un centesimo di differenza fra quello che l'operatore
vede a schermo e quello che finisce sulla polizza.

**Gli adattatori non arrotondano.** Una prova lo sorveglia: un `Math.round` di
troppo dentro un adattatore cambierebbe il premio senza che nessuno se ne
accorga.

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

## 5bis. FONTI — il pannello portali, chiamabile da IAM

Le stesse regole: stesso involucro, stessa chiave, stessa lista di errori. IAM
disegna il pannello a modo suo e chiede a QUOTO solo i dati.

Lo strato **non riscrive** il pannello (`server/fonti.js`, 28 rotte): ci passa
davanti e riconfeziona la risposta. Due pannelli Fonti che un giorno divergono
sarebbero peggio del problema che stiamo risolvendo.

### Lettura e accesso — basta la chiave interna

| metodo | rotta | a cosa serve |
|---|---|---|
| GET | `/api/v1/fonti` | elenco fonti con il pallino di stato |
| GET | `/api/v1/fonti/salute` | diagnosi completa (`?forza=1` ignora la cache) |
| GET | `/api/v1/fonti/:id` | una fonte sola |
| GET | `/api/v1/fonti/vigilanza` | stato del guardiano automatico |
| POST | `/api/v1/fonti/vigilanza/giro` | un giro di controllo adesso |
| POST | `/api/v1/fonti/:id/accedi` | avvia l'accesso guidato |
| GET | `/api/v1/fonti/:id/accesso` | come sta andando |
| POST | `/api/v1/fonti/:id/codice` | manda il codice a 6 cifre |
| POST | `/api/v1/fonti/:id/altro-codice` | chiedi al portale di rimandarlo |
| POST | `/api/v1/fonti/:id/verifica` | prova le credenziali senza aprire una sessione |

### L'accesso guidato, in due tempi come le quotazioni

```
POST /api/v1/fonti/allianz/accedi     →  { success:true, step:"credenziali", running:true }
GET  /api/v1/fonti/allianz/accesso    →  { success:true, stato:"serve_codice",
                                            messaggio:"Inserisci il codice.",
                                            loggato:false, passo_tecnico:"attesa_otp" }
POST /api/v1/fonti/allianz/codice     →  { success:true, loggato:true }
GET  /api/v1/fonti/allianz/accesso    →  { success:true, stato:"completo", loggato:true }
```

`stato` ha **cinque valori e basta**: `pronto · in_corso · serve_codice ·
completo · fallito`. Gli scraper ne hanno una decina, diversi da compagnia a
compagnia: se IAM li leggesse tutti, ogni nuova compagnia sarebbe una modifica
dentro IAM. Il passo grezzo resta visibile in `passo_tecnico`, per chi cerca un
guasto, ma nessuno è obbligato a leggerlo.

Un passo mai visto **mentre il servizio sta lavorando** vale `in_corso`, non
`fallito`: dire «è andata male» a un login che stava riuscendo fa premere di
nuovo Accedi e ricominciare da capo.

### Scrittura — chiave interna **più** `X-Operatore`

| metodo | rotta |
|---|---|
| POST | `/api/v1/fonti` |
| PUT | `/api/v1/fonti/:id` |
| DELETE | `/api/v1/fonti/:id` |
| POST | `/api/v1/fonti/:id/credenziali` |
| DELETE | `/api/v1/fonti/:id/credenziali` |

Queste richiedono in più l'intestazione **`X-Operatore`** con chi ha premuto il
pulsante. Senza, `403 FORBIDDEN`, e la chiamata **non arriva al pannello**.

Il motivo. La chiave interna dice «sono IAM», non dice «è stato Tizio». Le
credenziali dei portali compagnia sono la cosa più delicata che abbiamo: se un
giorno la chiave finisce in mano sbagliata, con la chiave sola non si deve poter
scrivere una password. E quando qualcosa cambia, nel registro deve restare un
nome, non un server.

**Leggere e far accedere NON lo richiedono**, di proposito: la vigilanza
automatica gira di notte e un operatore non ce l'ha. Se `accedi` chiedesse un
nome, il rientro automatico delle sessioni smetterebbe di funzionare — e nessuno
se ne accorgerebbe finché una compagnia non risulta scollegata al mattino.

### Due cose che restano vere

- **Le password non escono.** In lettura si dice solo se ci sono
  (`ha_password: true`), mai quali sono. È la stessa regola che il pannello
  segue già verso il browser.
- **Chi può vedere le Fonti lo decide IAM.** Il pannello è roba da Super Admin:
  la chiave interna vale come «IAM ha già controllato chi è». IAM non deve
  aprire queste schermate a un collaboratore che non ci deve entrare.

---

## 5ter. MOTOR — contratto approvato, implementazione bloccata

**Approvato da Francesco il 20/08/2026. Non ancora scritto**, e non per
dimenticanza: c'è una condizione davanti.

### La condizione

Il Motor non rientra in scope finché non esiste uno script che esegue una
quotazione vera dall'inizio alla fine, risponde passa / non passa e gira da riga
di comando senza che nessuno guardi lo schermo.

**Primo deliverable: `server/verifica/motor-e2e.test.mjs`**

- prende una targa vera di prova e un profilo cliente fisso;
- chiama i preventivatori uno per uno;
- passa se almeno una compagnia restituisce un premio credibile (> 50 €) e
  nessuna risponde con una pagina di errore;
- stampa per ogni compagnia: premio, secondi impiegati, oppure il motivo del
  fallimento;
- esce con `0` o `1`, e basta guardare quello.

Finché quello script non è verde, la API Motor non si scrive. Serve prima che
AXA e Allianz abbiano credenziali funzionanti (vedi §9).

### Il contratto, per quando ci arriveremo

```
POST /api/v1/quote/motor
  { targa, cliente:{…}, compagnie:["prima","axa","allianz","hdi","24h"] }
  → 202 { success:true, quote_id:"…", stato:"in_corso" }

GET  /api/v1/quote/{quote_id}
  → { success:true, prodotto:"motor", stato:"in_corso",
      risultati:[ { compagnia:"Prima", premio_annuo:412.90, … } ],
      progresso:[ { compagnia:"prima",   stato:"completo" },
                  { compagnia:"axa",     stato:"in_corso" },
                  { compagnia:"allianz", stato:"fallito", error_code:"AUTH_FAILED" } ] }
```

**Risultati parziali.** `risultati` si riempie mano a mano, mentre `stato` è
ancora `in_corso`. Il Motor interroga più compagnie insieme e qualcuna ci mette
minuti: aspettare che rispondano tutte vorrebbe dire tre minuti di clessidra su
una schermata vuota. Con i parziali, chi ha già risposto si vede subito e gli
altri restano in caricamento.

Questo è **diverso dai prodotti a tariffa**, dove il risultato o c'è o non c'è.
È l'unica differenza fra le due famiglie, ed è deliberata.

**Ordinati per prezzo.** `risultati` arriva già ordinato dal premio più basso al
più alto, e si riordina a ogni nuova risposta. L'ordinamento sta in QUOTO e non
in IAM per la stessa ragione di tutto il resto: è una regola di quotazione, e
metterla in IAM vorrebbe dire una seconda copia da tenere allineata. Le
compagnie ancora in caricamento restano in fondo — non hanno un prezzo, e
metterle in cima come «0 €» sarebbe una bugia.

**Una compagnia giù non fa fallire il preventivo.** Se Allianz non risponde, il
preventivo resta valido con le altre e Allianz risulta `fallito` con il suo
codice. Si fallisce tutto solo se falliscono tutte.

**Visura targa separata:** `GET /api/v1/veicolo/:targa` → marca, modello,
allestimento, alimentazione. Serve anche da sola — IAM la usa per riempire una
scheda senza quotare — e mescolarla alla quotazione vorrebbe dire rifarla ogni
volta.

---

## 5quater. IL PONTE: come IAM arriva davvero a QUOTO

Il contratto dice «chiave condivisa in variabile d'ambiente sui due lati».
Sul lato QUOTO va bene. Sul lato IAM no, e va detto chiaro: **IAM non è un
server.** È un sito statico su GitHub Pages, gira tutto nel browser, e nel
browser un segreto non è un segreto — chi apre gli strumenti di sviluppo se lo
legge, e il repository è pubblico.

Quindi il lato IAM del ponte è una **Edge Function di Supabase**, `quoto`:

```
browser IAM  ──sessione dell'operatore──▶  Edge Function «quoto»
                                                │  +X-Internal-Key
                                                │  +X-Operatore (dal token)
                                                ▼
                                    api.withusassicurazioni.it/api/v1/…
```

### Dove sta la chiave

In `ponte_segreti`, una tabella con RLS e **nessuna policy**: anon e
authenticated non leggono niente, solo il `service_role` passa. La chiave è
nata lì dentro (`gen_random_bytes`), non l'ha scritta nessuno e non è passata
per una chat né per un ramo di git.

I due lati la leggono da lì, ognuno con la propria chiave di servizio, che
hanno già: il backend all'avvio (`server/chiaveCondivisa.js`, e la rilegge ogni
mezz'ora), la Edge Function alla prima chiamata. Cambiarla è un `UPDATE`, e i
due lati si allineano da soli senza riavviare niente.

`INTERNAL_API_KEY` nel `.env` continua a vincere, se c'è: è la via di fuga se
un giorno Supabase non risponde.

**Se la chiave non arriva, la porta resta chiusa.** L'API risponde 401 a tutto.
Un'API che si apre a chiunque perché il segreto non è arrivato sarebbe molto
peggio di un'API che non si apre — e una prova lo sorveglia
(`server/verifica/chiave-ponte.test.mjs`).

### Chi può fare cosa

| chi | cosa |
|---|---|
| utente IAM attivo | `/products`, `/quote/*` — quotare è il mestiere di tutti |
| `top_master` | anche `/fonti/*`, come il pannello dentro QUOTO |

Il ruolo si legge da `iam_utenti` a ogni chiamata, **non dal token**: un ruolo
scritto nel token resterebbe valido fino alla scadenza anche dopo aver tolto i
permessi a qualcuno.

### `X-Operatore` lo scrive la funzione, non il browser

L'intestazione con chi ha premuto viene dal token già verificato. Se la
scrivesse il browser sarebbe una firma che chiunque può falsificare, e il
registro di chi ha cambiato una password non varrebbe niente.

### Come si chiama, da IAM

```js
const { data: { session } } = await sb.auth.getSession();
const r = await fetch(SUPABASE_URL + '/functions/v1/quoto/quote/casa', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + session.access_token,
             apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ provincia: 'RM', mq: 100 }),
});
```

Il percorso dopo `/quoto/` è esattamente la rotta dell'API v1. Niente da
imparare due volte.

### «Il ponte è aperto?» — una domanda con risposta sì o no

```
GET /functions/v1/quoto/_ponte
→ { "chiave_letta": true, "impronta": "a0c7d6247288",
    "risposta_quoto": 200, "prodotti": 9, "pronto": true }
```

Legge la chiave davvero, la usa davvero, e riporta cosa ha risposto QUOTO.
`pronto` è l'unica cosa da guardare. Nessun segreto esce: l'impronta è un
pezzo di sha256 e serve a confrontare i due lati senza mostrarne nessuno.

Al 20/08/2026 dice `risposta_quoto: 404`, `pronto: false`: la chiave c'è ed è
la stessa dalle due parti, ma il codice dell'API v1 non è ancora su `main`, e
la VPS pubblica da lì. **Quello è l'ultimo passo che manca.**

---

## 6. Dati e conservazione

Lo **storico** di quotazioni e analisi sta **in IAM**, agganciato a cliente e
trattativa. QUOTO e Lab tengono solo lavori in corso, in memoria, che scadono da
soli dopo un quarto d'ora.

**Un solo posto da presidiare per il GDPR: IAM.**

---

## 7. Ordine dei prodotti

Fatti, con parità di premio dimostrata (`server/verifica/parita-*.test.mjs`):

| codice | prodotto | campi minimi |
|---|---|---|
| `casa` | Casa HDI (portale) | provincia, mq |
| `amtrust` | AmTrust — 5 motori | prodotto |
| `rcnonreg` | RC non regolamentate | categoria, fatturato, massimale |
| `catastrofali` | Rischi catastrofali | cap, valore |
| `tutelalegale` | Tutela legale | prodotto |
| `rcrischidiversi` | RC rischi diversi | attivita, massimale, fatturato |
| `animali` | Animali domestici (Dottorpet) | tipo, pacchetto |
| `viaggio` | Viaggio | dest, livello, dataPartenza, dataRientro |
| `salute` | Salute / Malattia / LTC (Aglea Salus) | tipo |

Restano fuori:

- **RC professionale** (schermata `rcprof`) — c'è ed è a tariffa, ma il calcolo
  legge il modulo a schermo (`rcpCompute`, `rcpMedCompute`) e la tariffa arriva
  da `tariffe/rc_professionale.json` con un fetch. È il prossimo candidato, ed è
  più lavoro degli altri: sono due modelli di calcolo diversi (sottocategorie e
  classi mediche). La parte «professioni non regolamentate» è già `rcnonreg`.
- **Motor** — contratto approvato, implementazione ferma alla condizione: vedi
  §5ter.

Fuori dai prodotti, è fatto anche il **pannello Fonti** (§5bis): elenco, salute,
accesso guidato, vigilanza e scrittura credenziali, tutto richiamabile da IAM.

### Cosa manca per collegare davvero IAM

Fatto il 20/08/2026, senza che nessuno dovesse incollare niente:

1. la chiave e' nata dentro Supabase (ponte_segreti) — fatto;
2. il backend la legge da li' all'avvio — fatto;
3. la Edge Function `quoto` la legge da li' e fa da lato-server di IAM — fatta;
4. le due copie hanno la stessa impronta: `a0c7d6247288` — verificato.

Resta un passo solo: **il codice dell'API v1 deve arrivare su `main`**, perche'
la VPS pubblica da li' (`deploy/autopull.sh`, `BR=main`). Finche' non ci arriva,
`/functions/v1/quoto/_ponte` risponde `risposta_quoto: 404` e `pronto: false`.
Nel minuto dopo il merge diventa `200` e `pronto: true` da solo: l'autopull
riavvia il backend ogni minuto.
---

## 8. Dove vive il codice

| cosa | file |
|---|---|
| l'involucro, la lista errori, la chiave interna | `server/apiComune.js` |
| le quotazioni (router, due tempi, lavori) | `server/quoteApi.js` |
| gli adattatori per prodotto | `server/prodottiApi.js` |
| i calcoli condivisi browser + server | `tariffe/motore/*.js` |
| le Fonti (lo strato davanti al pannello) | `server/fontiApi.js` |
| il pannello Fonti vero, invariato | `server/fonti.js`, `server/fontiWatchdog.js` |
| il montaggio | `server/index.js` → `app.use('/api/v1/fonti', …)` **poi** `app.use('/api/v1', …)` |
| le prove del contratto | `server/verifica/quote-api.test.mjs` |
| le prove delle Fonti | `server/verifica/fonti-api.test.mjs` |
| le prove del montaggio | `server/verifica/montaggio-api.test.mjs` |
| le prove che il premio non è cambiato | `server/verifica/parita-*.test.mjs` |
| la chiave del ponte, letta da Supabase | `server/chiaveCondivisa.js` |
| il lato server di IAM (Edge Function) | `supabase/functions/quoto/index.ts` |
| le prove della chiave | `server/verifica/chiave-ponte.test.mjs` |

L'ordine di montaggio conta: `/api/v1` è montata su un **prefisso**, quindi se
venisse prima intercetterebbe anche le chiamate alle Fonti. Una prova lo
sorveglia.

> **Attenzione.** Nel repository c'è anche un `server.js` alla radice con una
> cartella `routes/` che espone `/api/v1/*`. **Non è avviato da nessuno**: la
> VPS lancia `server/index.js`. Implementare lì produrrebbe un endpoint che non
> risponde mai, senza nessun errore a dirlo. Una prova lo sorveglia.
