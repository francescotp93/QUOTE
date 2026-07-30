# Scraping dei portali compagnia in QUOTO

Come funziona la raccolta automatica di dati e preventivi dai portali delle compagnie:
architettura, fonti attive, credenziali, deploy, e cosa oggi funziona davvero.

Documento ricavato leggendo il codice, non la documentazione. Riferimenti al file e alla riga
dove serve. Aggiornato: luglio 2026.

---

## 1. Il problema che risolve

Le compagnie non ci danno API. Danno portali web con login, 2FA e sessioni che scadono.
Per avere preventivi e dati veicolo dentro QUOTO senza reinserirli a mano, guidiamo quei portali
con un browser vero, tenuto **sempre aperto e sempre loggato** su un server nostro.

Non è scraping "mordi e fuggi": è una **sessione persistente per compagnia**, che sopravvive ai
riavvii e si difende dal timeout di inattività.

---

## 2. Architettura

```
   Browser dell'agente (QUOTO, GitHub Pages)
                 │  HTTPS + JWT
                 ▼
   withus-backend  (Express, /opt/withus-backend)
     server/moto.js    → ponte preventivi/lookup moto
     server/fonti.js   → Pannello Fonti + proxy verso gli scraper
                 │  HTTP su 127.0.0.1 (mai esposto fuori)
                 ▼
   ┌──────────────┬──────────────┬──────────────┐
   │ moto  :4100  │ allianz :4200│ italiana:4300│   ← un processo Node per compagnia
   │ Xvfb  :99    │ Xvfb   :98   │ Xvfb   :97   │   ← display virtuale dedicato
   │ VNC   5900   │ VNC    5901  │ VNC    5902  │   ← per il primo login a mano
   └──────────────┴──────────────┴──────────────┘
                 │  Playwright · Chromium NON headless
                 ▼
     24hassistance.com   portaleagenzie.allianz.it   portale.plurima.net
```

Ogni scraper è **un file solo** (`quote-service.mjs`, ~300 righe) che fa tre cose insieme:
tiene aperto il browser, si autentica, ed espone un piccolo server HTTP su localhost.

---

## 3. Il pattern comune — «browser persistente + telecomando HTTP»

Tutti e tre gli scraper seguono lo stesso schema. Vale la pena capirlo una volta sola.

**Browser persistente.** `chromium.launchPersistentContext(userDataDir, …)` con
`headless: false`. Non è headless per due motivi: i portali riconoscono l'headless, e serve un
display reale per poter entrare via VNC quando il login automatico non basta.
Il profilo sta in `./userdata`: **la sessione sopravvive al riavvio del servizio.**

```js
const ctx = await chromium.launchPersistentContext(userDataDir, {
  headless: false, viewport: null, locale: 'it-IT',
  args: ['--no-sandbox', '--start-maximized', '--disable-blink-features=AutomationControlled'],
});
```

**Telecomando HTTP.** Un `http.createServer(...).listen(porta, '127.0.0.1')`: solo localhost,
mai esposto. Il backend gli parla in HTTP semplice. Endpoint tipici: `/status`, `/login`,
`/logindump`, `/lookup`, `/quote`, `/shot`.

**Serializzazione delle operazioni.** C'è una sola pagina e più richieste possono arrivare
insieme, quindi ogni operazione passa da una catena di promise:

```js
let CHAIN = Promise.resolve();
function locked(fn) { const run = CHAIN.then(fn, fn); CHAIN = run.then(() => {}, () => {}); return run; }
```
(`scraper/allianz/quote-service.mjs:210`, `italiana:249`)
Senza questo, il keep-alive navigherebbe via mentre una richiesta sta compilando un form.

**Keep-alive «umano».** Ogni 3-4 minuti naviga nel portale, muove il mouse a coordinate casuali
e scrolla, così la sessione non va mai in timeout. Se trova la sessione caduta, tenta un
ri-login silenzioso.

```js
await page.mouse.move(150 + Math.random() * 500, 150 + Math.random() * 350);
await page.evaluate(() => { window.scrollBy(0, 140); setTimeout(() => window.scrollTo(0, 0), 300); });
```
(`allianz:271-287`)

**Dump diagnostico.** Ogni scraper ha una `richDump()` che restituisce URL, titolo, primi 3000
caratteri di testo e l'elenco dei controlli della pagina (tag, id, name, type, testo). È lo
strumento con cui si tarano i selettori quando il portale cambia: si chiama `/logindump` o
`/otpdump`, si guarda cosa c'è davvero, si aggiornano i selettori.

**Screenshot su ogni operazione.** Finiscono in `shots/` — sono la scatola nera quando qualcosa
va storto in produzione.

---

## 4. Le tre fonti attive

| | 24H · Moto Platinum | Allianz | Italiana |
|---|---|---|---|
| **Cartella** | `scraper/moto/` | `scraper/allianz/` | `scraper/italiana/` |
| **Porta HTTP** | 4100 | 4200 | 4300 |
| **Display X** | `:99` | `:98` | `:97` |
| **VNC** | 5900 | 5901 | 5902 |
| **A cosa serve** | preventivi RC moto + dati veicolo da targa | interrogazione banca dati **ANIA** per targa | preventivo auto, step 1 |
| **Login** | manuale una volta via VNC | SSO + 2FA Duo, automatico | generico, automatico |
| **Stato** | **funzionante end-to-end** | login ok, estrazione da tarare | login ok, flusso da tarare |

### 4.1 Moto Platinum (24H Assistance) — `scraper/moto/quote-service.mjs`

L'unico completo. Pilota la SPA di `24hassistance.com/motoplatinum/v2`.

**Flusso `/quote?targa=..&nascita=..&se=20&rivalsa=si&garanzie=furto,tutela`:**

1. `fastquote()` — apre il form, compila `#FastQuoteBirthDate` e `#FastQuotePlate`, clicca
   `#cta_mp_fastquote_1`, poi seleziona la card «RCA completa» → «SCEGLI E PERSONALIZZA»
2. `setRivalsa()` — apre il dropdown custom `<tfh-ui-select>` della **rinuncia alla rivalsa**,
   sceglie Sì/No e **verifica** che il valore sia stato applicato
3. `continuaGaranzie()` — passa alla pagina delle garanzie accessorie
4. `aggiungiGaranzia()` per ciascuna richiesta. Le garanzie mappate:
   `furto` → Furto e Incendio · `infortuni` → Infortuni del conducente · `assistenza` ·
   `tutela` → Tutela legale · `monopattino` → Estensione monopattino.
   **La tutela legale è sempre inclusa d'ufficio** (`moto:232`)
5. `setSE()` — imposta la personalizzazione «SE» (default 20, minimo 10)
6. `readResult()` — legge veicolo, premio totale, garanzie incluse, badge WeRepair, e tutti i
   prezzi trovati in pagina

**Due accorgimenti che meritano di essere ricordati**, perché sono il tipo di cosa che si scopre
solo sbattendoci contro:

- *Hash routing.* La SPA usa hash-routing: un `goto` allo stesso path con hash diverso **non
  ricarica l'app** e si resta sulla targa precedente. Si passa da `about:blank` per forzare il
  reboot (`moto:37-41`).
- *Niente `networkidle`.* La pagina è piena di tracker che non si fermano mai: si usa
  `domcontentloaded` + `waitForSelector` sul form vero, così si parte prima.

**`/lookup?targa=..`** recupera i dati veicolo dalla sola targa (banca dati motorizzazione).
`readVeicolo()` (`moto:170`) legge le coppie **etichetta/valore** invece di fare regex sul testo
intero — più affidabile. Estrae: marca, modello, allestimento, prima immatricolazione,
cilindrata, cilindri, KW, CV, carrozzeria, tipo di cambio, marce, valore assicurato.
Se la data di nascita non serve la si passa farlocca (`01/01/1980`): al portale serve solo per
proseguire, non cambia il veicolo.

Altri endpoint: `/map` e `/rivalsa` sono strumenti di taratura, non di produzione.

### 4.2 Allianz — `scraper/allianz/quote-service.mjs`

**Non fa preventivi.** Serve solo la **banca dati ANIA** su
`portaleagenzie.allianz.it/Auto/InquiryAnia/Ricerca.aspx`: situazione assicurativa e proprietario
a partire dalla targa.

**Login SSO su `amlogin.allianz.it` con 2FA Duo.** Due modalità:

- **TOTP generato da noi.** Nel Pannello Fonti si salva il **segreto TOTP** (non il codice): lo
  scraper genera il codice a 6 cifre da solo. L'implementazione RFC 6238 è in casa —
  base32decode + HMAC-SHA1 + troncamento dinamico, periodo 30s (`allianz:53-70`).
- **Passcode Duo inserito a mano.** Si salva il codice dal pannello e vale 5 minuti.
  `enterPasscode()` (`allianz:105`) gestisce **sia l'iframe Duo classico sia l'Universal
  Prompt**, cercando il campo in tutti i frame e, se non lo trova, provando prima a rivelarlo
  («Enter a Passcode», «Altre opzioni»).

Niente push: solo passcode. Se l'auto-login fallisce, si entra **una volta** via VNC e la
sessione resta in `./userdata`.

`cercaTarga()` (`allianz:184`) è dichiaratamente **best-effort**: compila il primo input
plausibile (name/id contenente «targa», o `maxLength` 7-8) e clicca il bottone
cerca/ricerca/interroga. I selettori ASP.NET veri si tarano dopo il primo `/lookup` reale
guardando `_dump`.

### 4.3 Italiana — `scraper/italiana/quote-service.mjs`

**Attenzione, dettaglio importante**: il `DEFAULT_LOGIN` di questa fonte è
`https://portale.plurima.net/login.php` (`italiana:26`). La fonte «Italiana» punta cioè al
**portale Plurima** — lo stesso che stiamo mappando in
`docs/rilievi/plurima-mappa.md`. Le due attività si toccano: quello che impariamo mappando
Plurima serve direttamente a tarare questo scraper.

**Login volutamente generico**, perché il portale non è ancora mappato: trova il campo password
visibile, risale al `<form>` che lo contiene, e usa come username il **primo input testuale
visibile dello stesso form** (`italiana:126-137`). L'accorgimento serve a non riempire per
sbaglio la barra di ricerca sullo sfondo — problema reale, visto che Plurima ha una ricerca
globale in topbar. Se dopo l'invio compare un secondo fattore, inserisce il passcode salvato.

`autoStep1()` (`italiana:190`) è la bozza del preventivo auto: apre `/auto`, scrive la targa,
clicca **la lente** accanto al campo per far recuperare il veicolo dalla banca dati, e imposta
«situazione assicurativa» e «attestato di rischio» cercando le `<select>` per contenuto.
Restituisce sempre anche il `dump` della pagina, così ogni chiamata è insieme un tentativo e un
rilievo.

---

## 5. Il Pannello Fonti — `server/fonti.js`

Interfaccia in QUOTO (`page-fonti`), riservata al **Super Admin**. Gestisce credenziali e stato
di tutte le fonti.

**Cifratura a riposo.** AES-256-GCM. La chiave è `sha256(FONTI_SECRET)`; il blob salvato è
`'v1:' + base64(iv‖authTag‖ciphertext)`.

```js
function enc(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return 'v1:' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
```

Lo store è `server/fonti.store.json`. **Gli scraper rileggono lo stesso file e lo decifrano con
la stessa chiave**: per questo ogni unit systemd deve avere la **stessa `FONTI_SECRET`** del
backend — è la causa numero uno di «credenziali assenti nel Pannello Fonti».

**I segreti non tornano mai al browser.** L'API espone solo booleani (`ha_password`, `ha_totp`)
e uno username mascherato (`maschera()`: prima lettera, puntini, ultima lettera).

**Codice 2FA a tempo.** `POST /fonti/:id/codice` salva il passcode cifrato con timestamp;
`codice_in_attesa` resta vero **5 minuti**. È il flusso «apri Duo Mobile, copia il codice,
incollalo nel pannello, premi Accedi col codice».

**Fonti dinamiche.** Il Super Admin può aggiungere portali compagnia da interfaccia
(`POST /fonti`): id generato come `c-<slug-del-nome>`, con `ruolo` fra **`targa`**,
**`preventivo`** o **`entrambi`**, flag `has2fa`, `attiva`, note.
Lo scraper viene associato **per nome**: `scraperUrlFor()` (`fonti.js:20`) oggi riconosce solo
`/itali/` → porta 4300. Aggiungere una compagnia dal pannello **non** crea uno scraper: crea la
scheda credenziali.

**Stati mostrati** nel pannello, calcolati interrogando `/status` dello scraper con timeout 6s:

| Stato | Significato |
|---|---|
| `attiva` | scraper su **e** loggato nel portale |
| `scaduta` | scraper su, sessione caduta |
| `pronta` | credenziali presenti, scraper non raggiungibile |
| `non_configurata` | nessuna credenziale |
| `spento` | fonte disattivata dal pannello |

---

## 6. Il ponte verso QUOTO — `server/moto.js`

Router Express montato dietro `requireAuth`. Due endpoint, entrambi POST.

**`/moto/preventivo`** — inoltra allo scraper 4100 e **normalizza la risposta nel formato di
comparazione** usato dal frontend: `{ compagnia, annuale: { totale, premio_polizza, diritti },
semestrale, garanzie_incluse, werepair, veicolo, dettaglio }`.
Nota: Moto Platinum ha **solo frazionamento annuale**, quindi `semestrale: null`.
Timeout 150 secondi — lo scraper può metterci circa un minuto.

**`/moto/lookup`** — recupero veicolo dalla targa, con **due fonti in cascata**:

1. **Openapi.it** (`targa.openapi.it/moto/<targa>`, Bearer token) — veloce, dati PRA. Si usa solo
   se `OPENAPI_TARGA_TOKEN` è configurato. `mapOpenapiVeicolo()` normalizza con fallback
   multipli sui nomi dei campi (`marca|make|brand`, `modello|model|versione|…`) perché la
   risposta non è garantita.
2. **Scraper Moto Platinum** — gratuito, più lento, usato se Openapi manca o non risponde con
   una descrizione utile.

La risposta dice sempre da dove viene: `source: 'openapi' | 'scraper'`.

`server/fonti.js` fa da proxy per le altre: `/fonti/:id/login`, `/fonti/:id/auto`,
`/fonti/:id/preventivo`, e `/fonti/allianz/lookup?targa=`.

---

## 7. Deploy

Ogni scraper è un servizio **systemd** con `Restart=always`, in `/opt/withus-backend/scraper/<nome>/`.

`start-service.sh` avvia, se non già attivi, tre processi e poi Node:

```bash
Xvfb :98 -screen 0 1440x900x24 &      # display virtuale
DISPLAY=:98 fluxbox &                  # window manager (serve alle finestre del browser)
x11vnc -display :98 -rfbport 5901 -localhost -passwd "$VNC_PASS" -forever -shared -bg
node quote-service.mjs
```

**Il VNC è vincolato a `-localhost`**: si raggiunge solo con un tunnel SSH.

```bash
ssh -L 5901:127.0.0.1:5901 root@<VPS>     # dal Mac
# poi un VNC viewer su 127.0.0.1:5901
```

**Primo avvio, una volta per compagnia:** se l'auto-login non riesce, si entra via VNC, si fa il
login a mano, e da lì in poi `./userdata` conserva la sessione.

**Aggiornamento:**
```bash
cd /opt/withus-backend && git pull && systemctl restart withus-backend moto-scraper
```

Prerequisiti sul VPS: `apt-get install -y xvfb fluxbox x11vnc`, `npm install`,
`npx playwright install chromium`.

---

## 8. Stato reale, senza abbellimenti

| Componente | Stato |
|---|---|
| Moto Platinum `/quote` | **funzionante end-to-end**, usato in produzione |
| Moto Platinum `/lookup` | **funzionante**, con Openapi come fonte primaria |
| Allianz login (TOTP e passcode Duo) | **funzionante** |
| Allianz `/lookup` ANIA | **da completare** — `cercaTarga()` è best-effort, l'estrazione dei risultati non è ancora scritta: oggi restituisce il dump, non i dati strutturati |
| Italiana login | **generico, funzionante** in linea di principio; selettori da tarare con `/logindump` |
| Italiana `/auto` | **bozza** — apre lo step 1 e restituisce la mappa della pagina |
| `scraper/server.js` | **codice morto.** Importa `./browser.js`, `./login.js`, `./quoteForm.js`, `./parseResult.js`, `./logger.js` — **nessuno dei cinque esiste**. Il file non parte. Va cancellato o ricostruito |
| `scraper/health.js` | segnaposto per evitare crash-loop su deploy residui (es. Railway) |

---

## 9. Note operative e di sicurezza

Cose vere del codice attuale, da valutare — non allarmi.

- **Password VNC nei file committati.** `allianz2026`, `moto2026`, `italiana2026` stanno in
  chiaro nelle unit systemd dentro al repo. Il VNC è su `-localhost` e serve un tunnel SSH, quindi
  l'esposizione è limitata, ma sono comunque in git. Meglio spostarle in `EnvironmentFile`.
- **`FONTI_SECRET` ha un default debole.** Se la variabile manca, la chiave deriva da
  `'withus-fonti-' + HOSTNAME + '-v1'`: prevedibile. In produzione va impostata esplicitamente.
- **Un solo browser per compagnia.** Le richieste sono serializzate: due preventivi contemporanei
  si mettono in coda. Con `/quote` che dura ~1 minuto, è il collo di bottiglia da tenere d'occhio
  quando la rete cresce.
- **I selettori sono fragili per natura.** Ogni restyling del portale li rompe. La difesa è già
  nel codice: selettori a cascata, ricerca per testo invece che per id dove possibile, e i dump
  diagnostici per ritarare in fretta. Quando uno scraper smette di funzionare, il primo comando è
  `curl localhost:<porta>/logindump`.
- **Termini d'uso.** L'automazione dei portali di compagnia va tenuta dentro il perimetro dei
  mandati e degli accordi di collaborazione che abbiamo. È un tema contrattuale, non tecnico, e
  vale la pena verificarlo compagnia per compagnia prima di aggiungerne altre.

---

## 10. Aggiungere una compagnia nuova

1. Copia `scraper/italiana/` (è il più generico) in `scraper/<nome>/`
2. Scegli porta, display e VNC liberi — la sequenza attuale scende: 4100/:99/5900,
   4200/:98/5901, 4300/:97/5902 → il prossimo è **4400/:96/5903**
3. Aggiorna `FONTE_ID` e `DEFAULT_LOGIN` in cima a `quote-service.mjs`
4. Aggiungi la voce in `SCRAPER_URLS` e il match in `scraperUrlFor()` (`server/fonti.js:20`)
5. Copia l'unit systemd, imposta `FONTI_SECRET` uguale a quella del backend, `systemctl enable --now`
6. Inserisci le credenziali dal Pannello Fonti, poi `curl localhost:<porta>/logindump` e tara i
   selettori sul dump reale
7. Primo login via VNC se l'automatico non basta
