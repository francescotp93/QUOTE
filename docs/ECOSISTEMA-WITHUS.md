# Ecosistema WithUs — mappa del progetto

Documento di riferimento unico: com'è fatto il sistema, dove vive, cosa lo tiene insieme e dove
sono i punti fragili. Ricavato leggendo il codice dei due repository, non la documentazione
esistente — dove le due cose divergono, è segnalato.

Rilevazione: luglio 2026.

**Cosa copre**: architettura, confine fra le app, database, backend, scraping, deploy, compliance,
debito tecnico. **Cosa non copre**: la logica di calcolo dei premi prodotto per prodotto (sta nei
JSON di `tariffe/` e in `index.html`), e il contenuto di `index.html` di IAM riga per riga — è un
monolite da cui ho estratto la struttura, non ogni funzione.

---

## 1. Le applicazioni

| | IAM | QUOTO | withus-backend |
|---|---|---|---|
| **Repo** | `francescotp93/Agente-sospesi` | `francescotp93/QUOTE` | dentro `QUOTE/server/` |
| **Cos'è** | gestionale: agenti, utenti, produzione, KPI | quotatore multi-compagnia | API Node/Express |
| **Dominio** | `iam.withusassicurazioni.it` | `quoto.withusassicurazioni.it` | VPS OVH, `/opt/withus-backend` |
| **Hosting** | Vercel (statico) | Vercel / GitHub Pages (statico) | systemd sul VPS |
| **Stack** | HTML+CSS+JS vanilla, monolite `index.html` | idem, `index.html` da ~1,2 MB | Express, ESM |

Sono **due codebase separate su un solo database**. Non c'è build step, non c'è framework: si
modifica l'HTML e si pubblica.

### Le sezioni di IAM
`dashboard` · `agenti` · `utenti` · `team` · `azienda` · `performance` · `pipeline` · `lead` ·
`conto` · `sospesi` · `storico` · `workdiary` · `anomalie` · `carica` · `profilo` · `lab` ·
`quoto` (il ponte verso il quotatore)

### Le pagine di QUOTO
Prodotti: `rcprof` · `rca` · `rcab` · `cvtard` · `rcrd` · `rcvp` · `casa` · `beni` · `impresa` ·
`impresa-cat` · `cauzioni` (+ `cauzioni-appalti`, `cauzioni-privati`, `cauz-prov`) · `infortuni` ·
`infcirc` · `infortuni-famiglia` · `malattia` · `vita` · `viaggio` · `animali` · `fotovoltaico` ·
`tutela` / `tutelalegale` · `saravintage` · `persona` · `fi`
Operativi: `home` · `anagrafica` / `anagrafiche` · `emissioni` · `documenti` · `estratto` ·
`sinistri` · `ticket` · `richieste` · `storico` · `reti` · `providers` · `fonti` · `performance` ·
`utenti` · `admin` · `log`

---

## 2. Il database condiviso

Una sola istanza **Supabase** (`ekjxrnsfqxnfxzrthdcf`), Auth + Postgres. Due famiglie di tabelle.

**Lato IAM** — `iam_utenti` · `iam_team` · `iam_trattative` · `iam_lead` · `iam_ticket` ·
`iam_workdiary` · `iam_agenda` · `iam_conto` · `iam_azienda` · `iam_obiettivi` · `iam_progressi` ·
`iam_audit` · `iam_hub` · `iam_gare_config` · `iam_gare_posizioni` · `iam_kpi_re_config` ·
`iam_kpi_re_posizioni` · `iam_kpi_consap_posizioni` · `iam_mail_gruppi` · `posta_bozze` ·
`sessioni_giornaliere` · `agenti_config` · `quoto_backlog`

**Lato QUOTO** — `quote_anagrafiche` (la più usata: 87 riferimenti) · `quote_preventivi` ·
`quote_documenti` · `quote_sinistri` · `quote_ticket` · `quote_chat` · `quote_chat_threads` ·
`quote_collaboratori` · `quote_settings` · `quote_log` · `quote_utenti`

**Condivise** — `iam_utenti` (il perno) e `documenti` (l'archivio unico di tutti i file della
piattaforma: carte d'identità, libretti, patenti, contabili, polizze firmate, fatture, allegati
chat, documenti sinistri).

---

## 3. Il confine QUOTO ⇄ IAM

È il punto più delicato del sistema, e ha un contratto scritto: `INTERFACCIA-QUOTO-IAM.md`,
presente **identico nei due repo**. Ogni modifica a un punto di contatto va replicata in entrambi
nella stessa sessione.

### Il doppio cancello

L'accesso a QUOTO è governato da **due colonne diverse** di `iam_utenti`:

| Colonna | Chi la scrive | Chi la legge | Effetto |
|---|---|---|---|
| `quoto` | IAM | **IAM** | mostra/nasconde il bottone QUOTO nella navbar |
| `accesso_quoto` | IAM + QUOTO | **QUOTO** | permette/blocca il login dentro QUOTO |

Abilitarne una sola produce i due bug classici: bottone visibile ma *«Il tuo account non ha
accesso a QUOTO»*, oppure accesso funzionante senza bottone. **Vanno sempre impostate insieme.**
Il contratto stesso indica come debito da chiudere l'unificazione in una colonna sola.

Altre colonne del contratto: `ruolo` (`top_master` / `master` / `operativo`, con QUOTO che scrive
anche `admin` / `collaboratore` via `dbRuolo()` / `canonRuolo()` — mappatura da tenere coerente),
`accesso_iam`, `attivo`.

### Il passaggio di sessione

IAM e QUOTO stanno su **sottodomini diversi**, quindi origin diversi: il browser non condivide il
login. La sessione viene passata esplicitamente — `quotoUrl()` in IAM allega nell'hash
`#at=<access_token>&rt=<refresh_token>`, e `initDB()` in QUOTO li legge, chiama
`db.auth.setSession(...)` e ripulisce l'URL. Parametri del contratto: `from=iam`, `email`, e i nomi
`at` / `rt`.

🔒 La **splash screen** del passaggio IAM → QUOTO è bloccata dal `CLAUDE.md` di IAM: non si tocca
senza richiesta esplicita.

### L'indirizzo unico — il superamento in corso

Deciso il 28 luglio 2026 (`Agente-sospesi/INDIRIZZO-UNICO.md`). Il `vercel.json` di IAM riscrive
`/nuovo-preventivo/*` verso il server delle quotazioni, più **23 percorsi di servizio**
(`/api`, `/sign`, `/fonti`, `/moto`, `/pay`, `/shop`, `/crm`, `/lead`, `/notify`, `/preventivi`,
`/catalogo`, `/products`, `/public`, `/scrape`, `/mail`, `/auth`, `/user`, `/login`, `/backup`,
`/diag`, `/health`, `/l`, `/firma-collab`). L'elenco non è indovinato: viene dalle rotte dichiarate
in `api/index.js` e `server/*.js`.

Il risultato: il collaboratore resta sempre su `iam.withusassicurazioni.it` anche mentre preventiva.
**Effetto collaterale positivo sulla sicurezza**: con un dominio solo il passaggio dei token
nell'hash diventa superfluo — oggi quei token finiscono nella cronologia del browser. Il codice che
li passa è stato lasciato apposta, così nulla si rompe se la riscrittura viene disattivata, ma il
passo naturale successivo è toglierlo.

---

## 4. With Us One — la scocca

`withus-one.js` + `withus-one-skin.css` (in QUOTE) + `withus-one.css` (in IAM). Struttura a
**tre barre**: intestazione bianca con logo, ricerca globale e utente; barra scura col menu
orizzontale e il mega-menu prodotti; riga del titolo con briciole di pane e azioni.

Due principi dichiarati nel file, che spiegano perché è fatto così:

1. **Non si perde niente.** La vecchia intestazione e la vecchia barra a icone restano nel DOM,
   solo nascoste, perché la logica dei permessi continua a scriverci sopra e la scocca la rilegge
   da lì. Il file non riscrive le funzioni di IAM: le richiama.
2. **Una sola applicazione.** Il preventivatore non è un indirizzo dove si va: è una pagina che si
   apre dentro la scocca.

La pelle grafica è dichiaratamente ispirata a **Plurima** (i commit parlano di «sistema Plurima
completo»: contenitori, bottoni, campi, tabelle, badge, briciole, stepper). QUOTO, quando è aperto
dentro la scocca (`from=iam`), nasconde la propria topbar e adotta la palette verde WithUs.

Da `withus-one.js` risultano anche i collegamenti esterni cablati: **ANIA** via SSO Allianz, e
**`withus.assieasy.com/assieasy/`** — cioè l'installazione AssiEasy dell'agenzia.

`withus-ticket-uno.js` risolve un problema concreto: i ticket esistevano in due tabelle
(`iam_ticket` e `quote_ticket`) che non si vedevano fra loro. Il file le mostra **in un elenco solo**
dentro IAM, senza spostare dati: ogni ticket resta dove è nato e ogni modifica torna sulla sua
tabella d'origine.

---

## 5. Il backend — `withus-backend`

Express su VPS OVH, `/opt/withus-backend`, versione dichiarata `0.7.0-italiana`.
CORS chiuso ai tre domini nostri. Tutto ciò che conta sta dietro `requireAuth`, che valida il JWT
Supabase.

| Rotta | Modulo | Cosa fa |
|---|---|---|
| `/mail` | `mail.js` | IMAP/SMTP Aruba: inbox, lettura messaggio, invio |
| `/pay` | `pay.js` | PayPal: config pubblica, create-order, capture |
| `/notify` | `notify.js` | email automatiche sugli stati pratica |
| `/lead` | `lead.js` | lead dal widget pubblico del sito |
| `/shop` | `shop.js` | quotazione + pagamento dalla landing, checkout bonifico |
| `/l` | `shop.js` (ogRouter) | link condivisibili con anteprima Open Graph per WhatsApp |
| `/sign` | `sign.js` | firma cliente con OTP + email privacy/precontrattuale |
| `/firma-collab` | `firmaCollab.js` | firma documenti del collaboratore con controfirma agente |
| `/moto` | `moto.js` | ponte verso lo scraper Moto Platinum |
| `/fonti` | `fonti.js` | Pannello Fonti — credenziali scraping, solo Super Admin |
| `/backup` | `backup.js` | backup giornaliero Supabase + config |
| `/diag` | `index.js` | versione in esecuzione e presenza chiavi (booleani, mai segreti) |

Il Super Admin è cablato su email in `fonti.js` (`SUPER_ADMIN_EMAIL`).

---

## 6. Lo scraping dei portali compagnia

Documentato per esteso in **`docs/SCRAPING-COMPAGNIE.md`**. In sintesi: per ogni compagnia un
processo Node che tiene un **Chromium non headless** sempre aperto su un display virtuale, con
sessione persistente su disco, e un telecomando HTTP su `127.0.0.1`.

| Fonte | Porta | Display | VNC | Stato |
|---|---|---|---|---|
| 24H · Moto Platinum | 4100 | `:99` | 5900 | funzionante end-to-end |
| Allianz (banca dati ANIA) | 4200 | `:98` | 5901 | login ok, estrazione da completare |
| Italiana → **portale Plurima** | 4300 | `:97` | 5902 | login generico, flusso da tarare |

Credenziali cifrate AES-256-GCM in `server/fonti.store.json`, condiviso fra backend e scraper:
**stessa `FONTI_SECRET` ovunque**, o gli scraper non decifrano nulla.

Nota che collega i due filoni di lavoro: la fonte «Italiana» punta a `portale.plurima.net`, lo
stesso portale che stiamo mappando in `docs/rilievi/plurima-mappa.md`. Quello che impariamo lì
serve direttamente a completare quello scraper.

---

## 7. Deploy — la parte da chiarire

**Ci sono tre verità diverse su quale ramo sia "quello buono", e non coincidono.**

| Cosa | Ramo | Fonte |
|---|---|---|
| GitHub Pages / Vercel (i due siti statici) | `main` | `WORKFLOW.md` |
| **VPS backend + scraper** | **`claude/vibrant-tesla-o0glfd`** | `deploy/autopull.sh:11` |
| Regola dichiarata | «un repo = un solo ramo `main`» | `WORKFLOW.md` |

`WORKFLOW.md` è netto: *«Un repo = un solo ramo (`main`) = ciò che viene pubblicato. Eventuali rami
`claude/...` → da cancellare, non usare»*. Ma `deploy/autopull.sh` fa `git fetch origin
claude/vibrant-tesla-o0glfd` ogni minuto e allinea il VPS **a quel ramo**, con `reset --hard`.

Quindi **il frontend e il backend si pubblicano da rami diversi**, e la regola scritta non descrive
il sistema reale. È esattamente la situazione che `WORKFLOW.md` voleva evitare — quella in cui il
lavoro «sembra sparire».

Su `QUOTE` esistono oggi oltre venti rami remoti (`claude/*`, `feat/*`, `fix/*`, `backup/*`,
`leo/*`, `align/main-to-production`, `hardening/low-risk-fixes`).

**Come funziona l'auto-deploy del VPS** (`deploy/autopull.sh`, timer systemd ogni minuto):
tira il ramo, guarda i file cambiati, **installa da solo i nuovi scraper** (basta pushare una
cartella `scraper/<compagnia>/` con la sua unit), e riavvia **solo i servizi toccati**.
Le sessioni degli scraper non si perdono: i cookie sono su disco e `fonti.store.json` è ignorato
da git.

---

## 8. Qualità e presidi

**Prove automatiche (IAM)** — `npm test` lancia `controlla-tutto.mjs`, che esegue ogni file
`verifica/*.test.mjs` e riassume in italiano. Oggi coprono: agenda, compagnie/collaboratori,
fatture e allegati, gruppi posta, indirizzo unico, inviti utenti, KPI abilitazioni, KPI doppioni,
scocca a tre barre. QUOTO **non ha un equivalente**.

**Agenti specializzati** — `.claude/agents/`: `quoto-specialist` (in QUOTE), `iam-specialist` (in
Agente-sospesi), e `interfaccia-quoto-iam` **in entrambi**, il cui compito è impedire che una
modifica su un'app rompa l'altra.

**Compliance** — `Agente-sospesi/compliance/vendita-a-distanza/`: guida e checklist, relazione
descrittiva, script di primo contatto, informativa sulla procedura d'acquisto, termini e condizioni
di recesso, comunicazione IVASS per il sito.

**Migrazioni SQL in attesa** — quattro file `sql/DA-APPROVARE-*.sql`, **non eseguiti**, che per
loro stessa intestazione li lancia Francesco o Leo dopo via libera esplicito:
archivio documenti (regole di accesso ai dati personali degli assicurati),
blindatura di `iam_utenti`, gruppi posta, invito utenti.
Più `super-admin-e-lead.sql` (visibilità trattative e lead inbound).

---

## 9. Debito tecnico — inventario

Cose vere del codice attuale. Nessuna è urgente da sola; insieme raccontano dove il sistema è
cresciuto in fretta.

| # | Cosa | Dove | Effetto |
|---|---|---|---|
| 1 | **Tre verità di deploy** che non coincidono | `WORKFLOW.md` vs `deploy/autopull.sh:11` | il lavoro finisce su rami che nessuno pubblica |
| 2 | **`GROQ_API_KEY` in chiaro** in un file servito al browser | `Agente-sospesi/config.js:4` | è una chiave a pagamento, in un sito statico pubblico e in git. Va revocata e spostata dietro il backend |
| 3 | **`vercel.json` di QUOTE punta a `frontend/index.html`**, che non esiste | `QUOTE/vercel.json` | la cartella contiene solo `index.legacy.html` e `quoto.html`. Il deploy reale serve l'`index.html` di root |
| 4 | **Due generazioni di backend convivono** | `api/index.js` + `routes/` + `services/` + `backend/src/` (Postgres diretto, JWT, bcrypt) vs `server/` (Supabase Auth) | due modelli di autenticazione e due schemi utenti (`users` vs `iam_utenti`) |
| 5 | **`services/` e `backend/src/services/` sono copie** | entrambe | si modifica una e si dimentica l'altra |
| 6 | **`scraper/server.js` è codice morto** | importa `browser.js`, `login.js`, `quoteForm.js`, `parseResult.js`, `logger.js` — nessuno esiste | il file non parte |
| 7 | **Doppio cancello `quoto` + `accesso_quoto`** | `iam_utenti` | classe di bug più frequente del confine; il contratto stesso propone di unificarli |
| 8 | **Ticket in due tabelle** | `iam_ticket` + `quote_ticket` | unificati solo in vista da `withus-ticket-uno.js` |
| 9 | **Token di sessione nell'URL** | hash `#at`/`#rt` | finiscono nella cronologia. L'indirizzo unico li rende superflui |
| 10 | **Password VNC in chiaro** nelle unit systemd committate | `scraper/*/deploy/*.service` | mitigato da `-localhost` + tunnel SSH, ma sono in git |
| 11 | **`FONTI_SECRET` con default derivato da `HOSTNAME`** | `server/fonti.js:39` | prevedibile se la variabile non è impostata in produzione |
| 12 | **Loghi compagnia costruiti con `location.origin`** | `QUOTE/index.html:10975` | sotto dominio unico cercano il file sulla radice di IAM e spariscono. Una riga: usare il percorso relativo come `logoChip` |
| 13 | **QUOTO senza prove automatiche** | — | IAM ha `verifica/`, QUOTO no |
| 14 | **Oltre venti rami remoti su QUOTE** | — | difficile capire cosa è vivo |

---

## 10. Il lavoro di analisi concorrenza

In corso, documentato in:

- **`docs/MAPPA-RCPOLIZZA-PLURIMA-ASSIEASY.md`** — mappa delle tre piattaforme (RCPolizza, Plurima
  by Italnext, AssiEasy) con 33 funzioni tradotte in interventi su QUOTO e IAM, priorità e bozza di
  schema dati
- **`docs/rilievi/plurima-mappa.md`** — mappa di lavoro su Plurima, con lo stato di ciò che è
  confermato e le checklist di ciò che manca
- **`Agente-sospesi/MAPPA-GESTIONALE-ASSIEASY-IAM.md`** — la parte gestionale, con l'ordine di
  lavoro proposto per IAM in dieci interventi

Le priorità che ne sono uscite e che toccano questo sistema: tassonomia prodotti a più livelli,
questionario assuntivo condiviso fra prodotti, catena di stato del preventivo, motore provvigionale,
chiusura estratto conto self-service, widget azionabili in home.

---

## 11. Indice dei documenti

| File | Repo | Cosa contiene |
|---|---|---|
| `INTERFACCIA-QUOTO-IAM.md` | **entrambi** | contratto del confine — fonte unica della verità |
| `WORKFLOW.md` | entrambi | regole sui rami e checklist prima del push |
| `CLAUDE.md` | Agente-sospesi | architettura IAM e i blocchi da non toccare |
| `INDIRIZZO-UNICO.md` | Agente-sospesi | il passaggio a dominio unico, cosa cambia e come si torna indietro |
| `compliance/vendita-a-distanza/` | Agente-sospesi | sei documenti di compliance |
| `docs/SCRAPING-COMPAGNIE.md` | QUOTE | come funziona lo scraping |
| `docs/ECOSISTEMA-WITHUS.md` | QUOTE | questo file |
| `deploy/README.md` | QUOTE | auto-deploy del VPS |
| `scraper/*/deploy/README.md` | QUOTE | installazione dei singoli scraper |
| `supabase/EMAIL_SETUP.md` | QUOTE | configurazione email Supabase |

---

## 12. Le tre cose da sistemare per prime

Non sono le più grandi: sono quelle che costano poco e tolgono di mezzo interi problemi.

1. **Decidere qual è il ramo di produzione e allineare tutto.** Oggi il frontend si pubblica da
   `main` e il backend da `claude/vibrant-tesla-o0glfd`. Finché è così, «l'ho pushato» non vuol dire
   niente di preciso. È il punto 1 del debito e la causa di tutti gli altri malintesi.
2. **Revocare la chiave Groq** e spostarla dietro il backend. È in chiaro in un file pubblico e in
   git: va considerata compromessa a prescindere.
3. **Unificare il doppio cancello** `quoto` + `accesso_quoto` in una colonna sola. Lo propone già il
   contratto d'interfaccia, ed elimina la classe di bug più frequente del sistema.
