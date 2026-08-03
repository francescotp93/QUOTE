# Architettura Multi-Compagnia — QUOTO

> Documento di design + playbook operativo. Obiettivo: rendere **veloce e ripetibile**
> l'aggiunta di nuove compagnie al quotatore Auto/Motor, riusando ciò che già funziona
> per **Italiana Assicurazioni** (portale Plurima/Italnext).
>
> Questo file **descrive** l'architettura e fornisce scaffold separati in
> `scraper/_template/` (non importati da nulla). Non modifica codice di produzione.

---

## 0. TL;DR

- Oggi esiste **un solo adapter di fatto** (Italiana) cablato in tre layer:
  scraper Playwright persistente (`scraper/italiana/quote-service.mjs`), ponte Express
  (`server/moto.js` → `/moto/hub-auto`, `/moto/hub-veicolo`, `/moto/quota-auto`),
  frontend wizard Auto (`index.html`, funzioni `openAuto`/`autoNext`/`awHub*`).
- Per scalare a N compagnie servono due cose:
  1. un **contratto dati normalizzato** (veicolo/anagrafica/situazione/premio) uguale
     per tutte, così il frontend non sa quale compagnia c'è sotto;
  2. due "tipi" di adapter — **INTERNO a Plurima** (solo config) e **PORTALE PROPRIO**
     (nuovo scraper da template) — dietro la stessa interfaccia.
- Il refactoring è **a basso rischio**: si aggiunge un layer `companies` SENZA toccare
  il path Italiana esistente (che resta il default/fallback).

---

## 1. Mappa del flusso attuale (Italiana / Plurima)

### 1.1 Tre layer

```
[Frontend index.html]  --HTTP-->  [Express server/moto.js]  --HTTP-->  [Scraper Playwright italiana/quote-service.mjs]  --in-page-->  [Portale Plurima]
   wizard Auto             ponte autenticato (requireAuth)        browser persistente :4300                       ajaxPlurima() firmato
```

### 1.2 Scraper Italiana — `scraper/italiana/quote-service.mjs`

Browser Playwright **persistente** (`launchPersistentContext` su `./userdata`, riga ~60),
display virtuale, **telecomando HTTP su `127.0.0.1:4300`** (riga ~1064). Caratteristiche chiave:

- **Credenziali dal Pannello Fonti** cifrate AES-256-GCM (`dec()`/`creds()`, righe 32-57).
  La fonte è `__custom['c-italiana']` o per match `/italiana/i` sul nome (`getFonte`, riga 41).
- **Login generico/resiliente**: `autoLogin()` (riga 202) compila utente/password + eventuale
  passcode (`enterPasscode`, riga 176); `ensureLogin()` (256) e `keepAlive()` ogni 3 min (1066).
- **Motore "firmato" in-page**: `plurimaAjax(action, params)` (riga 560) riusa la funzione
  `ajaxPlurima()` **della pagina** (che firma da sola con `server_key`/`time` rolling) — è il
  modo robusto per chiamare le azioni interne senza ricostruire la firma.
- **`driveVeicolo(targa, sitLabel, opts)`** (riga 586) — IL CUORE. Pilota il **wizard reale**
  fino allo step 2: scrive `#targa`, attende `#situazione_assicurativa`, seleziona la situazione,
  gestisce **Bersani/Voltura** (`bersani_provenienza`/`targa_provenienza`, righe 604-618),
  clicca `a[href="#next"]` e legge l'oggetto globale `dati_preventivatore.data`
  (veicolo, proprietario, contraente, situazione_assicurativa/attestato, scadenza, garanzie).
  Normalizza il veicolo in un oggetto piatto (righe 660-674). Le chiamate "a freddo" vengono
  rifiutate ("targa vuota") perché manca lo stato del wizard lato server: per questo si PILOTA.
- **Endpoint HTTP** (server, riga 686+):
  - `/status` (login?), `/login`, `/logindump`
  - `/hub?targa=&cf=` → `recupera_situazione_assicurativa` + `cerca_anagrafica` (riga 857)
  - `/hubveicolo?targa=&situazione=&bersani=` → `driveVeicolo` (riga 845)
  - `/api?action=&...` → `plurimaAjax` generico (riga 876)
  - `/explore`, `/sniff*`, `/jsgrep`, `/hubprobe` → **strumenti di reverse-engineering** (generici,
    riusabili su qualsiasi portale per scoprire azioni/campi)
  - `/auto`, `/preventivo` → tentativo di preventivo completo a click (best-effort, **NON è il
    path del premio definitivo**: vedi §1.5).
- **Concorrenza**: `locked(fn)` (riga 579) serializza tutte le operazioni sul singolo browser
  (un solo tab). Importante: **le compagnie con scraper proprio sono processi separati** → girano
  in parallelo tra loro, ma ognuna è seriale al suo interno.

### 1.3 Ponte Express — `server/moto.js`

Protetto da `requireAuth` (agente loggato su QUOTO). `ITALIANA = http://127.0.0.1:4300`.

- **`GET /moto/hub-auto`** (riga 127): chiama `ITALIANA/hub`, **normalizza** situazione+anagrafica
  in un oggetto ricco (`anagrafica` con CF/nome/indirizzo/contatti, `veicolo.tipo/prodotto`,
  `situazioni`). Questo è già "formato QUOTO".
- **`GET /moto/hub-veicolo`** (riga 170): chiama `ITALIANA/hubveicolo`, ritorna
  veicolo+situazione_assicurativa+proprietario+contraente+scadenza+garanzie_predefinite.
- **`POST /moto/quota-auto`** (riga 90): **già pensato multi-compagnia** — costruisce una
  **lista `risultati[]`** da comparare e un blocco `recuperato` (anagrafica/veicolo/situazione).
  Oggi popola solo Italiana; il commento riga 120 segna esplicitamente *"Le prossime compagnie si
  aggiungono qui con la stessa struttura"*. **Questo è il punto di innesto naturale del fan-out.**
- `POST /moto/preventivo` e `/moto/lookup` (Openapi/Moto Platinum) sono per Moto, fuori scope Auto.

### 1.4 Pannello Fonti — `server/fonti.js`

- Fonti "fisse" (`FONTI`, riga 63: 24h, allianz) + **fonti dinamiche** `__custom` create dal
  Super Admin (`POST /fonti`, riga 297): nome/url/username/password (cifrati)/has2fa/ruolo/note.
- **`scraperUrlFor(id, nome)`** (riga 20): mappa una fonte → URL del suo scraper. Oggi conosce
  solo `italiana` (regex `/itali/`). **È QUI che si registra lo scraper di ogni nuova compagnia
  con portale proprio.**
- Proxy generici `/:id/{auto,preventivo,api,explore,sniff,sniff/start|stop}` (righe 140-235):
  funzionano per **qualsiasi** fonte che abbia uno scraper mappato → niente codice nuovo per gli
  strumenti di analisi.

### 1.5 Frontend — `index.html` (wizard Auto)

- `AUTO_STEPS = ['Targa','Anagrafiche','Veicolo','Situazione','ARD/CVT','Preventivo','Modifica/Conferma']`
  (riga 9530). `openAuto(tipo)` (9538), `renderAutoStep()` (9553), `autoNext()` (9780).
- Step 0 → `autoNext()`: `awHubRecupera()` (anagrafica, riga 9643) **bloccante e veloce**, poi avvia
  `awHubVeicolo()` (riga 9682) **in background** (~15-25s) e lo applica entrando nello step Veicolo
  con `awApplicaVeicolo()` (riga 9712). Mapping: `awMappaAnagrafica` (9623), `awMappaSituazione`
  (9694), `awMapAlim` (9669), `awSituazioneLabel` (9662, traduce tipo preventivo QUOTO → label Plurima).
- **Stato attuale**: il wizard fa **recupero dati** (hub) + **richiesta** salvata; lo step
  `Preventivo` (indice 5) è in `AUTO_SKIP` (riga 9533) — **il PREMIO non è ancora cablato lato UX**.

### 1.6 Cosa manca (gap noti)

1. **Premio** (`calcola_preventivo`): schema noto
   `{targa, id_prodotto:1, arr_campi_dati_tecnici, arr_campi_prodotto, arr_sezioni, arr_anagrafica, id_portafoglio}`.
   Va costruito a valle di `driveVeicolo` (riusando lo stato wizard) e gli ID prodotto/portafoglio
   per Italiana sono: `id_compagnia 44`, `id_tariffa 422` (Autovetture), `codice_prodotto 01023`,
   `id_portafoglio 3489`. **Nota architetturale**: questi ID oggi NON sono hardcoded da nessuna parte —
   sono impliciti nel wizard. Nel nuovo design diventano **CONFIG per compagnia** (vedi §3a).
2. **Legge Bersani** (import classe CU da altra targa): lo scraper lo supporta già a livello di
   `driveVeicolo` (`bersaniTarga`), ma il flusso completo fino al premio non è chiuso.

---

## 2. Interfaccia ADAPTER COMPAGNIA (astratta)

### 2.1 Principio

Ogni compagnia espone lo **stesso** set di metodi. Il frontend e `quota-auto` parlano solo con
questa interfaccia + col **contratto dati normalizzato** (§2.3). Chi sta sotto (Plurima vs portale
proprio) è un dettaglio implementativo.

### 2.2 Metodi minimi

```
interface CompanyAdapter {
  id: string                  // es. 'italiana', 'c-xxx'
  nome: string                // etichetta UI ("Italiana Assicurazioni")
  capabilities: {             // cosa sa fare DAVVERO (il frontend si adatta)
    veicolo: boolean,         // recupera dati veicolo da targa
    situazione: boolean,      // recupera attestato/CU
    anagrafica: boolean,      // recupera cliente da CF
    premio: boolean,          // calcola il premio
    bersani: boolean          // import CU da altra targa
  }

  stato()                                  -> { stato:'attiva|scaduta|spento|non_configurata', url? }
  login()                                  -> { ok, url? }                 // forza (auto)login
  recuperaVeicolo(targa, situazione, opts) -> VeicoloNorm + SituazioneNorm (+ Anagrafica owner)
  recuperaSituazione(targaOrCf)            -> SituazioneNorm
  recuperaAnagrafica(cf)                   -> AnagraficaNorm
  calcolaPremio(datiCompleti, garanzie)    -> PremioNorm
}
```

Mappatura sull'esistente Italiana:

| Metodo adapter             | Implementazione Italiana oggi                                  |
|----------------------------|----------------------------------------------------------------|
| `stato()`                  | scraper `/status` (via `fonti.statoScraper`)                   |
| `login()`                  | scraper `/login`                                               |
| `recuperaVeicolo()`        | scraper `/hubveicolo` → `driveVeicolo()`                       |
| `recuperaSituazione()`     | scraper `/hub` → `recupera_situazione_assicurativa`           |
| `recuperaAnagrafica()`     | scraper `/hub` → `cerca_anagrafica`                            |
| `calcolaPremio()`          | **da implementare** → `plurimaAjax('calcola_preventivo', …)`  |

### 2.3 Contratto dati NORMALIZZATO (input/output comune)

Questi formati sono **già di fatto definiti** da `server/moto.js` (hub-auto/hub-veicolo) e dai
mapper del frontend. Li promuoviamo a contratto ufficiale.

**VeicoloNorm** (output `recuperaVeicolo`):
```json
{ "marca": "...", "modello": "...", "allestimento": "...", "alimentazione": "Benzina|Diesel|GPL|Metano|Ibrida|Elettrica|Altro",
  "cilindrata": "1600", "kilowatt": "85", "cavalli": null,
  "data_immatricolazione": "YYYY-MM-DD", "uso": null, "valore": "12000", "codice_motornet": "..." }
```

**AnagraficaNorm** (output `recuperaAnagrafica`):
```json
{ "codice_fiscale": "...", "cognome": "...", "nome": "...", "ragione_sociale": null, "partita_iva": null,
  "data_nascita": "YYYY-MM-DD", "sesso": "M|F", "cellulare": "...", "email": "...",
  "indirizzo": "...", "numero_civico": "...", "cap": "...", "comune": "...", "provincia": "XX", "valido": true }
```

**SituazioneNorm** (attestato di rischio):
```json
{ "compagnia_provenienza": "...", "tariffa_provenienza": "Bonus/Malus|Tariffa fissa|Con franchigia",
  "data_scadenza_contratto": "YYYY-MM-DD", "cu_provenienza": "1..18", "cu_assegnazione": "1..18",
  "attestato_rischio": [ { "codiceTipoSinistro": "1M", "sinistrosita": [ { "anno": 2024, "numeroSinistri": "0|NA" } ] } ] }
```

**PremioNorm** (output `calcolaPremio`, già la forma usata in `quota-auto` riga 107-112):
```json
{ "compagnia": "...", "annuale": { "totale": 423.50, "premio_polizza": null, "diritti": null },
  "semestrale": null, "provvigioni": null, "daAutorizzare": false, "salvato": false,
  "garanzie_incluse": ["RC","Infortuni del conducente"], "errore": null }
```

**InputPremio** (`datiCompleti` + `garanzie`): contiene `targa`, `situazione`, `bersani?`,
`massimale`, `frazionamento`, `tipoGuida`, `garanzie[]`, oltre ai dati già recuperati. Lo scraper
ricostruisce da qui il payload nativo `calcola_preventivo` (per Plurima) usando la CONFIG di §3a.

> **Regola d'oro**: il contratto NON cambia mai per compagnia. Se una compagnia ha un campo extra,
> va in `dettaglio: {}` (campo libero), mai come nuova chiave top-level che il frontend deve conoscere.

---

## 3. Due tipi di compagnia — Playbook

### 3a. Compagnia INTERNA a Plurima (solo CONFIG) ✅ percorso veloce

Plurima è un **aggregatore**: lo stesso endpoint `__ajax.php` e lo stesso `driveVeicolo` servono
tutte le compagnie del portale. Cambiano solo gli **identificativi prodotto**. Quindi una nuova
compagnia interna = **una riga di config**, zero nuovo scraper.

**Dove va la config.** Crea/usa un registry dedicato (file nuovo, separato — vedi scaffold
`scraper/_template/companies.config.json`). Per Italiana:

```json
{
  "italiana": {
    "nome": "Italiana Assicurazioni",
    "tipo": "plurima",
    "scraper": "italiana",
    "plurima": {
      "id_compagnia": 44,
      "id_tariffa": 422,
      "codice_prodotto": "01023",
      "id_portafoglio": 3489,
      "id_prodotto": 1,
      "prodotto_label": "Autovetture"
    },
    "capabilities": { "veicolo": true, "situazione": true, "anagrafica": true, "premio": true, "bersani": true }
  }
}
```

**Esempio: aggiungere una NUOVA compagnia interna a Plurima** (es. "HDI" id_compagnia 12,
id_tariffa 510, codice_prodotto 02011, id_portafoglio 4001) — copia/incolla, cambia i numeri:

```json
{
  "hdi": {
    "nome": "HDI Assicurazioni",
    "tipo": "plurima",
    "scraper": "italiana",          // <-- STESSO scraper (stesso portale Plurima!)
    "plurima": {
      "id_compagnia": 12,
      "id_tariffa": 510,
      "codice_prodotto": "02011",
      "id_portafoglio": 4001,
      "id_prodotto": 1,
      "prodotto_label": "Autovetture"
    },
    "capabilities": { "veicolo": true, "situazione": true, "anagrafica": true, "premio": true, "bersani": true }
  }
}
```

**Come consumare la config nel calcolo premio** (lato scraper, funzione `calcolaPremio` da
aggiungere a `italiana/quote-service.mjs`). Schema noto del payload:

```
plurimaAjax('calcola_preventivo', {
  targa,
  id_prodotto: cfg.plurima.id_prodotto,          // 1
  id_portafoglio: cfg.plurima.id_portafoglio,    // dalla CONFIG
  // id_compagnia / id_tariffa / codice_prodotto guidano la selezione prodotto a monte
  arr_campi_dati_tecnici: [...],   // da driveVeicolo (cilindrata/kW/alimentazione/immatricolazione)
  arr_campi_prodotto:     [...],   // massimale, frazionamento, tipo guida
  arr_sezioni:            [...],   // garanzie selezionate (RC, infortuni conducente, ARD/CVT…)
  arr_anagrafica:         [...]    // contraente/proprietario recuperati
})
```

**Playbook 3a — passi:**
1. Reperisci gli ID prodotto della compagnia su Plurima (di solito da `carica_campi`/`carica_tariffe`,
   già sniffabili con `/sniff` o `/explore?grepjs=1`). Annota `id_compagnia/id_tariffa/codice_prodotto/id_portafoglio`.
2. Aggiungi la voce nel registry config (sopra).
3. Aggiungi la compagnia al **fan-out** di `POST /moto/quota-auto` (riga ~120 di `moto.js`): per ogni
   compagnia con `tipo:'plurima'` chiama lo stesso scraper passando `&company=hdi`; lo scraper usa
   la config per scegliere prodotto/portafoglio e ricomporre il payload `calcola_preventivo`.
4. Verifica il premio con `/preventivo?company=hdi&targa=…` (o l'equivalente proxy `/fonti/:id/preventivo`).
5. Nessuna modifica al frontend: il nuovo premio appare nella lista `risultati[]`.

> Vincolo pratico: tutte le compagnie Plurima condividono **un solo browser/tab** (riga `locked()`).
> Il fan-out per esse va fatto **in sequenza** sullo scraper Italiana (o si avvia un secondo
> processo Plurima su porta diversa se servisse parallelismo).

### 3b. Compagnia con PORTALE PROPRIO (nuovo scraper da template)

Quando la compagnia NON è dentro Plurima (portale SSO proprio, come Allianz). Si clona il template
`scraper/_template/` → `scraper/<nome>/` e si personalizzano i punti di contatto col portale.
Schema identico a italiana/allianz: **browser persistente + telecomando HTTP su porta dedicata +
credenziali dal Pannello Fonti**.

**Convenzioni porte/display** (non sovrapporre):
| Scraper   | Porta HTTP | Display | VNC  |
|-----------|-----------|---------|------|
| 24H/Moto  | 4100      | :99     | 5900 |
| Allianz   | 4200      | :98     | 5901 |
| Italiana  | 4300      | :97     | 5902 |
| **nuovo** | **4400**  | **:96** | **5903** (poi 4500/:95/5904 …) |

**Punti da personalizzare nel template** (cerca i marcatori `// TODO[ADAPTER]`):
1. **Identità**: `FONTE_ID`, nome, `DEFAULT_LOGIN`, porta/display/VNC (header + `start-service.sh` + `.service`).
2. **`creds()` / `getFonte()`**: regex di match della fonte nel Pannello Fonti.
3. **Login**: selettori utente/password, 2FA (TOTP come Allianz `totpCode()` riga 60, oppure passcode
   come Italiana `enterPasscode()`), riconoscimento "loggato" (`loggedIn`/`isPublicLanding`).
4. **`recuperaVeicolo(targa, situazione)`**: come si interroga la banca dati targa del portale
   (chiamata API firmata o pilotaggio form) → produce **VeicoloNorm** + **SituazioneNorm**.
5. **`recuperaAnagrafica(cf)`** (se disponibile) → **AnagraficaNorm**.
6. **`calcolaPremio(dati, garanzie)`** → **PremioNorm**. Riusa gli strumenti generici `/explore`/`/sniff`
   già nel template per reverse-engineerare l'API premio.
7. **Endpoint HTTP**: mantieni i nomi standard (`/status /login /hub /hubveicolo /api /preventivo
   /explore /sniff*`) così i proxy generici di `fonti.js` funzionano senza modifiche.

**Playbook 3b — passi:**
1. `cp -r scraper/_template scraper/<nome>` ; aggiorna porta/display/VNC/`FONTE_ID`.
2. Crea la fonte nel Pannello Fonti (`POST /fonti`) → ottieni `id` (`c-<nome>`); salva credenziali.
3. Registra lo scraper in `server/fonti.js` → `SCRAPER_URLS` + `scraperUrlFor()` (aggiungi la regex
   del nome → `http://127.0.0.1:4400`). Da qui i proxy `/fonti/:id/*` funzionano subito.
4. Primo login UNA volta via VNC (porta 590x) se l'auto-login non basta; poi la sessione persiste.
5. Mappa il portale con `/fonti/:id/explore` e `/fonti/:id/sniff/start|stop` (fai un preventivo a mano).
6. Implementa `recuperaVeicolo`/`recuperaAnagrafica`/`calcolaPremio` producendo i formati Norm.
7. Aggiungi la compagnia al fan-out di `quota-auto` (`tipo:'portale'`, chiama `http://127.0.0.1:4400/...`).
8. Crea l'unit systemd da `deploy/<nome>-scraper.service` e avvia.

---

## 4. Piano di REFACTORING (prioritizzato, basso rischio)

> Principio: **non toccare** il path Italiana che funziona. Aggiungere un layer attorno, con
> Italiana come default. Niente riscritture.

**Ordine consigliato:**

1. **[Doc + config, rischio ~0]** Introdurre il registry `companies.config.json` (anche solo con
   Italiana). Nessun consumo iniziale → puro dato. *File: nuovo, separato.*

2. **[Backend, rischio basso]** In `server/moto.js`, estrarre il blocco "chiama Italiana e
   normalizza" di `quota-auto` (righe 100-119) in una funzione `quotaCompagnia(cfg, input)`.
   Italiana diventa la prima entry di un array `COMPAGNIE`. Comportamento identico se l'array ha
   solo Italiana → **nessuna regressione**. *File: `server/moto.js`.*

3. **[Backend, rischio basso]** Generalizzare `ITALIANA = ...` in una mappa
   `SCRAPER_BY_ID` allineata a `fonti.js#SCRAPER_URLS`. Hub-auto/hub-veicolo restano invariati
   (continuano a puntare a Italiana come "hub centrale").

4. **[Scraper, feature nuova, isolata]** Aggiungere a `italiana/quote-service.mjs` la funzione
   `calcolaPremio()` (azione `calcola_preventivo`) + endpoint `/premio`, **senza** toccare
   `driveVeicolo`/`/hubveicolo`. È additivo. Chiudere qui anche il caso Bersani fino al premio.

5. **[Backend]** Esporre `POST /moto/premio-auto` che instrada su `calcolaPremio` della compagnia
   richiesta (config-driven). Il fan-out di `quota-auto` lo richiama per ogni compagnia con
   `capabilities.premio:true`.

6. **[Frontend, ultimo]** Riattivare lo step `Preventivo` (togliere `5` da `AUTO_SKIP`, riga 9533)
   e mostrare la lista `risultati[]` con il look "pv2" (card garanzie + pannello "Il tuo preventivo"
   + totale). Solo dopo che il backend ritorna premi reali. *File: `index.html`.*

7. **[Template]** Solo quando arriva la prima compagnia con portale proprio: clonare `scraper/_template`.

**Cosa NON toccare (per non rompere Italiana):**
- `driveVeicolo()` e l'oggetto `dati_preventivatore` (righe 586-684) — è tarato sul wizard reale.
- `plurimaAjax()` / `ensureOnPortal()` / `ajaxPlurima` in-page (firma rolling).
- `loggedIn`/`isPublicLanding`/`autoLogin`/`keepAlive` (login resiliente già rodato).
- Gli endpoint `/hub`, `/hubveicolo`, `/status`, `/login` (consumati da `moto.js` e `fonti.js`).
- `server/moto.js#hub-auto`/`hub-veicolo` (formato già "QUOTO", usato dal wizard).
- Il **doppio cancello** d'accesso QUOTO e qualsiasi cosa tocchi `accesso_quoto`/`from=iam`
  (territorio IAM — vedi `INTERFACCIA-QUOTO-IAM.md`).

---

## 5. Scaffold (in `scraper/_template/`, non importato da nulla)

- `scraper/_template/companies.config.json` — registry compagnie (esempio Italiana + HDI).
- `scraper/_template/quote-service.template.mjs` — scheletro scraper portale proprio con i
  marcatori `// TODO[ADAPTER]` nei punti da personalizzare e gli endpoint standard.
- `scraper/_template/start-service.sh`, `scraper/_template/deploy/scraper.service` — avvio/systemd.

Vedi i file per i dettagli. Sono volutamente minimali e **separati dalla produzione**.
