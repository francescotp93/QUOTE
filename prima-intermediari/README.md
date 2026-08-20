# Prima Intermediari → Supabase — estrattore preventivi

Scraper **API-based** (non DOM) del portale `intermediari.prima.it`.
Estrae i preventivi dell'agenzia e li porta su Supabase in modo idempotente.

---

## 1. Cosa ho scoperto sul portale

| | |
|---|---|
| **Endpoint** | `POST https://intermediari.prima.it/api/graphql` |
| **Autenticazione** | **solo cookie di sessione** — nessun bearer token, nessun header custom |
| **Introspection** | disabilitata in produzione (`__schema` → `null`) |
| **Query dei preventivi** | `searchSavesNew` |
| **Performance** | **lenta**: 45–60 s su dataset grandi; oltre ~600 record risponde HTML di errore |

### Argomenti di `searchSavesNew` (trovati per probing, non documentati)

```graphql
searchSavesNew(
  limit: Int
  status: { in: [PURCHASABLE | PURCHASED | EXPIRED | DOCUMENTS_REQUIRED] }
  productType: MOTOR | HOME
  saveCode: { is: "PR1234567" }        # codice preventivo
  referenceCode: { contains: "DC55500" } # targa
  contractor: { ... }                   # TextInput
)
```

**Due cose che la UI non ti dà:**

1. **`status: PURCHASED`** — l'API lo accetta ma il filtro del portale non lo espone.
   È quello che permette di calcolare il **conversion rate reale** preventivo → polizza,
   dato che a mano non hai.
2. **`limit`** — la UI ne mostra 20 e basta. Comportamento misurato:
   il server restituisce `min(2 × limit, limit + 10)` record.
   Va quindi trattato come *"almeno"*, mai come *"esattamente"* — lo scraper
   rilancia con limite doppio quando un segmento risulta saturo.

### Come si legge il premio

| Ramo | Percorso | Nota |
|---|---|---|
| Motor | `Σ installmentPrices[].coverageAmounts.legal` | **verificato**: 140,33 + 70,00 = **210,33** = quanto mostra la UI |
| Casa e Famiglia | `selection.fullPrice.amount` | già aggregato |

`presentation` è il prezzo di listino mostrato barrato, `full` il prezzo pieno senza sconti.
Salviamo tutti e tre più il payload grezzo in `raw` (jsonb), così una revisione futura
non richiede un re-scrape.

---

## 2. Il problema MFA, e come è risolto

Prima usa Auth0 con **OTP obbligatorio**. Nessuno scraper può generare quel codice.

La leva è la checkbox **"Ricorda questo dispositivo per 30 giorni"**: fa emettere ad Auth0
un cookie di *device trust*. Con quel cookie nel profilo persistente di Playwright,
i login successivi con sola email+password **saltano l'OTP per 30 giorni**.

```
npm run login     # 1 volta ogni 30 giorni, con un umano che digita l'OTP
npm run scrape    # tutte le altre volte, headless, senza intervento
```

Se il device trust scade, `scrape` **non si blocca**: esce con codice `2`,
scrive `status = 'auth_required'` in `prima_scrape_runs` e ti dice di rifare il login.
Questo è il punto da monitorare: un alert su quella riga evita di accorgersi
del problema tre settimane dopo.

---

## 3. Installazione

```bash
npm install
npx playwright install chromium
cp .env.example .env      # compila PRIMA_PASSWORD e le chiavi Supabase
```

Poi crea le tabelle: esegui `sql/001_schema.sql` nel SQL editor di Supabase
(è idempotente, si può rilanciare).

```bash
npm run login       # interattivo, una volta ogni 30gg
npm run scrape:dry  # prova senza scrivere nulla: dump in preventivi-dry-run.json
npm run scrape      # produzione
```

---

## 3bis. Installazione su VPS headless (la strada scelta)

Il device trust nasce dal browser che esegue il login. Se fai il login sul tuo PC
e copi il profilo sul server, Auth0 vede un contesto diverso e puo' richiedere
di nuovo l'OTP. **Quindi il login va fatto direttamente sul server.**

Su un VPS senza schermo si risolve con un display virtuale + VNC su tunnel SSH:

```bash
# --- una volta sola, sul server ---
./deploy/install-vps.sh
cp .env.example .env && nano .env
# esegui sql/001_schema.sql su Supabase

# --- login con OTP, una volta ogni 30 giorni ---
./scripts/login-vnc.sh            # sul server

ssh -L 5900:localhost:5900 utente@tuo-server   # dal tuo PC
# poi apri un client VNC su localhost:5900 e digita l'OTP
```

Il VNC ascolta **solo su localhost** (`-localhost`): non e' raggiungibile da
internet, ci arrivi unicamente attraverso il tunnel SSH. Non togliere quel flag —
esporresti al mondo una sessione browser gia' autenticata sul portafoglio.

### Non scoprire la scadenza a scraper fermo

```bash
npm run session      # exit 0 = ok | 3 = scade a breve | 2 = gia' scaduta
```

In `deploy/crontab` gira ogni mattina alle 08:00: quando mancano 5 giorni scrive
su stderr e cron ti manda una mail. C'e' anche un promemoria mensile il giorno 1.

Installa tutto con `crontab deploy/crontab` (adatta `PRIMA_DIR` e `MAILTO`).

### Il calendario, in chiaro

| Quando | Cosa | Chi |
|---|---|---|
| ogni notte 03:15 | estrazione preventivi | automatico |
| ogni mattina 08:00 | controllo sessione | automatico |
| **1 volta ogni 30 giorni** | **login con OTP via VNC** | **una persona** |

Quel terzo rigo e' l'unico intervento manuale. Se salta, lo scraper si ferma
in modo pulito (`auth_required` sul log run) invece di scrivere dati parziali.

---

## 4. Architettura

```
src/config.js     parametri, segmenti, timeout
src/auth.js       Playwright: login MFA + device trust + storageState
src/client.js     client GraphQL con cookie, retry/backoff, timeout, AuthRequiredError
src/queries.js    query ricostruite dal portale (documentate)
src/normalize.js  GraphQL → riga DB, con la logica dei premi
src/supabase.js   upsert idempotente + log delle run
src/index.js      orchestratore
test/             22 test sulla normalizzazione, su dati reali anonimizzati
```

**Segmentazione.** Non chiediamo mai "tutto insieme": il backend va in timeout.
Lo scraper cicla le 8 coppie `(4 status × 2 rami)`, deduplica per `uuid`
e continua anche se un segmento fallisce (la run finisce come `partial`,
non come successo silenziosamente incompleto).

**Idempotenza.** Ogni riga ha un `content_hash` sui soli campi di business.
Se nulla è cambiato si aggiorna solo `last_seen_at`, così `updated_at`
resta un segnale affidabile di "questo preventivo è davvero cambiato"
e non rumore da re-scan.

---

## 5. Cosa ci fai, lato business

Due viste già pronte nello schema:

- **`prima_preventivi_da_recuperare`** — preventivi ancora `PURCHASABLE` con giorni
  alla scadenza. È la lista di recupero lead: oggi quei preventivi scadono e basta.
- **`prima_conversion_per_intermediario`** — conversion rate e premio medio per
  collaboratore e per ramo, grazie al campo `mailIntermediario` + status `PURCHASED`.

---

## 6. Limiti noti, dichiarati

- **`searchSavesNew` non espone email né telefono del contraente.** Verificati 36 campi
  candidati: non ci sono. Per contattare i lead serve una seconda query di dettaglio
  sul singolo preventivo, ancora da mappare.
- **Nessun filtro per data** lato API: non si può fare un incrementale "solo da ieri".
  Ogni run rilegge il set e si affida al `content_hash` per non riscrivere invano.
- **Il campo `reference`** contiene la targa per Motor. È un dato personale:
  è salvato in chiaro (serve per il matching) **e** in hash, valuta tu il trattamento
  in base al registro GDPR dell'agenzia.
- **Scraping vs. condizioni d'uso.** Stai estraendo dati della tua agenzia da un portale
  a cui accedi legittimamente, ma le condizioni contrattuali Prima potrebbero disciplinare
  l'accesso automatizzato: vale una verifica prima di metterlo in cron quotidiano.
  Il rate limiting (2 s tra query, nessun parallelismo) è già impostato in modo conservativo.
