# Contratto QUOTO ↔ scraper Motor (VPS)

Questo documento è il riferimento per chi aggiorna gli scraper motor sul VPS
(`/opt/withus-backend/scraper/*`). **Il codice del backend di produzione e degli
scraper HDI / AXA / Groupama / Allianz-quotazione non è in questo repository**:
finché non viene committato, questo file è l'unico contratto condiviso tra il
frontend (index.html, in repo) e gli scraper (fuori repo).

## 0. Come portare il codice del VPS in questo repo (5 minuti)

È pronto lo script **`scripts/recupero-vps.sh`**: eseguito SUL VPS, copia il
codice vivo di `/opt/withus-backend` nel branch `vps-backend-import` di questo
repo (cartella `vps/`), **escludendo automaticamente ogni segreto** (`.env`,
`fonti.store.json`, sessioni browser `userdata/`, cookie, screenshot, log) e
mascherando i valori delle variabili d'ambiente nelle unit systemd. Non tocca
i file originali né i servizi in esecuzione, e chiede conferma prima del push.

Sul VPS (serve un token GitHub con permesso di scrittura sul repo, oppure `gh`
già autenticato):

```bash
# copia lo script sul VPS (o incollane il contenuto in un file), poi:
GITHUB_TOKEN=ghp_xxx bash recupero-vps.sh
```

Fatto questo, Leo può leggere il codice reale e applicare i punti 3, 4 e 5
qui sotto direttamente nel repository.

## 1. Parametri inviati dal frontend a ogni quotazione

Da luglio 2026 il frontend invia a **tutte** le compagnie, oltre ai parametri
storici (targa, nascita, cf, situazione, bersani…):

| Parametro        | Valori                          | Note |
|------------------|---------------------------------|------|
| `tipoGuida`      | `Libera` \| `Esperta` \| `Esclusiva` | default **Libera** |
| `massimale`      | `Minimo` \| `10 milioni`        | massimale RCA richiesto |
| `frazionamento`  | `Annuale` \| `Semestrale`       | |
| `etaGuidatore`   | `18 - 25` \| `26 - 29` \| `30 o più` | solo nei POST (24H, HDI, AXA, Groupama) |
| `dataDecorrenza` | `aaaa-mm-gg`                    | |
| `garanzie`       | CSV di chiavi (es. `incendio_furto,cristalli`) | garanzie ARD/CVT selezionate in QUOTO |

Endpoint interessati: `GET /moto/premio` (Italiana), `POST /moto/preventivo24/start`,
`POST /moto/preventivoHDI/start`, `POST /moto/preventivoAxa/start`,
`POST /moto/preventivoGroupama/start`, `GET /moto/allianz-auto`, ponte estensione
Prima (postMessage, campi `tipoGuida`/`massimale`/`frazionamento`).

**Ogni scraper deve LEGGERE e APPLICARE questi parametri sul portale.**

## 2. Regola del tipo di guida (obbligatoria per tutti)

- Applicare sul portale la guida richiesta (`tipoGuida`).
- Se la compagnia **non prevede** la guida esperta/esclusiva per quel tipo di
  veicolo: **quotare comunque in GUIDA LIBERA** — mai bloccare o far fallire il
  preventivo per questo motivo.
- Riportare nella risposta la guida realmente applicata nel campo
  **`tipo_guida`** (es. `"Guida libera"`): il frontend la mostra nel dettaglio
  riga e, se diversa da quella richiesta, la evidenzia in arancio.
- Facoltativi ma consigliati in risposta: `massimale` e `frazionamento`
  effettivamente applicati.

## 3. Allianz — gestione garanzie e pacchetto base

Lo scraper Allianz (`/moto/allianz-auto`) deve:

1. **Deselezionare sul portale TUTTE le garanzie** che non compaiono nel
   parametro `garanzie` della richiesta (l'area riservata ne pre-attiva
   diverse di default: vanno tolte).
2. Lasciare sempre attivo solo il **PACCHETTO BASE**:
   - RCA
   - Rinuncia alla rivalsa
   - Infortuni del conducente — massimale **31.000 € morte / 31.000 € invalidità**
   - Riparazione in carrozzeria convenzionata
3. Attivare in aggiunta solo le garanzie presenti in `garanzie`.
4. Restituire `garanzie_incluse` (array) e le `sezioni` (per i pacchetti) così
   come effettivamente configurate, oltre a `tipo_guida`/`massimale` applicati.

## 4-bis. AGGIORNAMENTO dopo l'import del codice VPS (8 lug 2026)

Letto il codice reale, il quadro è cambiato:

- **AXA e Groupama hanno GIÀ** sessione persistente, keep-alive e auto-relogin
  con credenziali cifrate + 2FA/OTP. Il login "che cade di continuo" NON è codice
  mancante: causa quasi certa = **mismatch di `FONTI_SECRET`** tra backend (cifra)
  e scraper (decifra). Il backend carica la chiave da `EnvironmentFile` (.env),
  gli scraper hanno `FONTI_SECRET` **commentata** nei .service.
  → **Diagnosi**: eseguire `scraper/diagnosi-fonti.mjs` dentro l'ambiente di ogni
  servizio; confrontare l'IMPRONTA della chiave (backend e scraper devono avere la
  stessa). Se un fonte è "NON decifrabile" → allineare `FONTI_SECRET`, ri-salvare
  le credenziali dal Pannello Fonti, riavviare gli scraper.

- **HDI** `/premio` (browser) sfora il lock a 135s → "operazione HDI oltre 135s".
  → **FATTO**: il backend prova PRIMA la via diretta API `/premio-motor` (veloce,
  come il preventivo Casa) e RIPIEGA su `/premio`. Off con `HDI_DIRECT=0`.
  Ricordare `HDI_SCRAPER_URL=http://127.0.0.1:4401` (tunnel al server IP-fidato).

- **Italiana** "conducente esperto spuntato → pannello sconto non comparso":
  spuntava SEMPRE la guida esperta. → **FATTO**: legge `tipoGuida`, default Libera
  (non spunta), esperta solo se richiesta.

- **Allianz**: → **FATTO** mappatura massimale etichetta→codice, infortuni 31k/31k,
  risposta con `tipo_guida`/`massimale_applicato`/`pacchetto_base`.
  **DA FARE (test live)**: deselezione garanzie non richieste (parametro già
  inoltrato, deselezione da implementare e provare sul portale con cautela).

- **AXA** "Veicolo non riconosciuto (timeout recupero)": intermittente, da indagare live.

## 4. AXA e Groupama — pattern sessione (già implementato)

Riferimento del pattern virtuoso (scraper 24H, `scraper/moto/quote-service.mjs`)
per eventuali nuovi scraper — AXA e Groupama lo seguono già:

1. **Profilo browser persistente**: `chromium.launchPersistentContext(userDataDir, …)`
   con `userDataDir` dedicato (es. `/opt/withus-backend/scraper/axa/userdata`).
   Cookie e sessione sopravvivono ai riavvii del servizio.
2. **Keep-alive**: `setInterval` ogni **4 minuti** che visita una pagina leggera
   dell'area riservata (vedi `quote-service.mjs:302`) così la sessione non scade
   per inattività.
3. **Auto-relogin**: all'avvio e quando il keep-alive rileva la pagina di login,
   rifare il login in automatico con le credenziali del **Pannello Fonti**
   (`fonti.store.json`, cifrate AES-256-GCM con `FONTI_SECRET` — stesso schema di
   `scraper/allianz/quote-service.mjs:24-57`). Eventuale OTP/2FA: usare il codice
   registrato via `POST /fonti/:id/codice` (valido 5 minuti).
4. **`FONTI_SECRET` nei service systemd**: oggi è commentata nei file
   `deploy/*.service` — va valorizzata con la STESSA chiave del backend, altrimenti
   la decifratura delle credenziali fallisce in silenzio.
5. Endpoint `/status` che riporti `{ url, loggato }` come gli altri scraper, così
   il Pannello Fonti mostra il pallino verde/rosso reale.

## 5. HDI — tempi di quotazione

- Il frontend ora attende fino a **390 secondi** (prima 240): se il portale HDI
  impiega di più, la quotazione si perdeva con "Calcolo troppo lungo".
- Lato scraper: tenere la sessione HDI già loggata (stesso pattern del punto 4)
  e riusare il browser già aperto — il grosso del tempo perso è tipicamente
  login + avvio browser a freddo.
- Il job deve continuare a scrivere lo stato (`/status/:jobId`) anche oltre i
  5 minuti: è il frontend a decidere quando arrendersi.

## 6. Risposte — formato atteso dal frontend

Formato comune dei risultati (`risultati[0]` per i flussi asincroni):

```json
{
  "annuale": { "totale": 512.34 },
  "prodotto": "…",
  "tipo_guida": "Guida libera",
  "massimale": "10 milioni",
  "frazionamento": "Annuale",
  "garanzie": [ { "nome": "RCA", "premio": 480, "massimale": "10.000.000 €", "pacchetto": false } ],
  "garanzie_incluse": [ "Rinuncia alla rivalsa" ]
}
```

Tutti i campi extra sono facoltativi: il frontend mostra ciò che c'è. `massimale`
per singola garanzia e il flag `pacchetto` alimentano il dettaglio della riga
compagnia (tasto espansione).
