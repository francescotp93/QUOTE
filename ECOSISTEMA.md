# L'ecosistema With Us — come è fatto e come si lavora

Documento di consegna per chi arriva adesso (persona o assistente).
Scritto il **4 agosto 2026**. Ogni numero qui dentro è stato misurato, non
ricordato.

> **Il repository è pubblico.** Qui non ci sono indirizzi di macchine, chiavi,
> credenziali né dati di clienti — e non devono entrarci. Tutto quello che è
> segreto vive nel `.env` della VPS o nei secret di GitHub e Supabase.

---

## 0. In dieci righe

Withus Assicurazioni è un'agenzia. Il suo software è fatto di **due
applicazioni** che sembrano una sola, **un database condiviso**, e **un motore
che parla con i portali delle compagnie**.

| | cos'è | dove vive |
|---|---|---|
| **IAM** | il gestionale dell'agenzia: clienti, portafoglio, contabilità, collaboratori | `francescotp93/Agente-sospesi` → `iam.withusassicurazioni.it` |
| **QUOTO** | il preventivatore: 49 schermate di prodotti assicurativi | `francescotp93/QUOTE` → `quoto.withusassicurazioni.it` |
| **Il motore** | backend + 10 scraper che quotano sui portali delle compagnie | VPS OVH → `api.withusassicurazioni.it` |
| **Il database** | Supabase, uno solo, condiviso | progetto `ekjxrnsfqxnfxzrthdcf` |

QUOTO **non ha un database suo**: le sue tabelle (`quote_*`) stanno nello stesso
progetto Supabase di IAM (`iam_*`). Esiste anche un progetto Supabase che *si
chiama* «QUOTE»: è **vuoto e in pausa**, non lo usa nessuno. Il nome inganna.

---

## 1. Come le due applicazioni diventano una

IAM è la **scocca**. QUOTO ci sta dentro, in un riquadro.

```
┌─ IAM (withus-one.js: barra + menu + router) ──────────────┐
│  Scrivania · Nuovo preventivo · Clienti · Portafoglio     │
│  Contabilità · Agenzia · Strumenti · Amministrazione      │
│                                                            │
│  ┌─ <iframe id="w1-qframe"> ────────────────────────────┐ │
│  │   QUOTO, con ?from=iam                               │ │
│  │   → la sua barra si nasconde                         │ │
│  │   → carica withus-one-skin.css                       │ │
│  │   → le briciole dicono «With Us One»                 │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

### Il ponte, in pratica

La scocca **non chiama funzioni** dentro il riquadro quando può evitarlo:
scrive nell'**indirizzo**. Il motivo è che il riquadro può stare su un altro
dominio, e da fuori non si può scrivere dentro.

I parametri che QUOTO legge all'avvio:

| parametro | effetto |
|---|---|
| `?from=iam` | modalità «dentro la scocca»: barra nascosta, pelle caricata |
| `?page=<nome>` | apre quella schermata (`showPage`) |
| `?prod=<chiave>` | apre **quel prodotto** (`apriProdotto`) — vedi §4 |
| `?q=<testo>` | scrive nella ricerca clienti e cerca |
| `?email=<mail>` | precompila il login |
| `#at=…&rt=…` | ponte di sessione: token passati e **subito cancellati** dall'indirizzo |

Quando il riquadro è già aperto e si può leggere dentro, la scocca chiama
direttamente `showPage`/`apriProdotto`/`anagTab` **senza ricaricare**: un
ricaricamento perde la sessione e fa ripartire tutto.

---

## 2. La grafica

Tre fogli di stile, in cascata. **Non si scrivono colori a mano nei
componenti**: si usano i token.

### 2.1 `withus-one-tokens.css` — la fonte unica

```css
--w1-verde:#02984e         /* il verde With Us: azioni, evidenze, marchio */
--w1-verde-vivo:#01c061    /* accenti luminosi */
--w1-verde-scuro:#016b38   /* hover dei bottoni */
--w1-verde-tenue:#eaf7f0   /* fondi di badge e righe evidenziate */
--w1-scuro:#1b2733         /* la barra scura della scocca */
--w1-sfondo:#eef1f4        /* fondo delle pagine */
--w1-bordo:#dde3e9         /* bordi dei contenitori */
--w1-testo:#1f2a37 / --w1-testo2:#5a6b7c / --w1-testo3:#8b9aa9
--w1-raggio:4px            /* angoli squadrati, stile Plurima */
--w1-testo-base:13px
--w1-focus:0 0 0 3px rgba(2,152,78,.14)
```

**Il carattere**: Inter. **La densità**: alta — è un gestionale, non una
vetrina. Testo base a 13px, angoli a 4px, ombre appena accennate.

### 2.2 `withus-one-skin.css` — la pelle

Traduce i token nei componenti di QUOTO quando gira dentro la scocca. Legge i
token, **non ridefinisce i valori**.

### 2.3 `withus-pictograms.css` — i pittogrammi

Icone **Tabler** dentro un contenitore With Us. Non si usano **mai** emoji
Unicode: le disegna il sistema operativo, quindi la stessa faccina è gialla su
un telefono, piatta su Windows e diversa su un Mac. In un gestionale
assicurativo un simbolo che cambia forma a seconda di chi guarda non è un
simbolo.

```html
<span class="wus-pictogram teal"><i class="ti ti-car"></i></span>
```

Regole, e sono sorvegliate da una prova:

- contenitore 26–34 px, raggio **massimo 8 px**, fondo verde o teal tenue;
- **uno solo** per titolo, scheda prodotto o sezione;
- **mai** dentro pulsanti, tabelle o pastiglie di stato — lì restano le icone
  Tabler nude. Un pittogramma in un pulsante lo fa sembrare una scheda; in una
  tabella, riga dopo riga, diventa rumore;
- per azioni, navigazione, filtri e stati: icone Tabler normali.

Mappa consigliata: `ti-shield-check` protezione · `ti-car` auto · `ti-home`
casa · `ti-heartbeat` salute · `ti-users-group` famiglia · `ti-building`
aziende · `ti-plane` viaggi · `ti-file-description` documenti · `ti-signature`
firma · `ti-credit-card` incasso · `ti-calendar-event` calendario · `ti-bell`
promemoria · `ti-camera` sinistri · `ti-chart-bar` report.

### 2.4 Colori con un significato

Il colore **non è decorazione**: dice qualcosa. Rosso e ambra solo per urgenze
vere.

| | |
|---|---|
| verde | attivo, pagato, in regola |
| ambra `#b06a00` su `#fff4e6` | da fare, lead, in attesa |
| rosso `#a3352a` su `#fff6f5` | scaduto, insoluto, errore che blocca |
| grigio | non attivo, non ancora disponibile |

**Il colore non è mai l'unico segnale.** Ogni pallino ha la sua spiegazione al
passaggio del mouse, ogni riquadro porta scritto anche il testo. Chi non
distingue i colori deve poter lavorare lo stesso.

---

## 3. La struttura dei file

### QUOTO (`francescotp93/QUOTE`)

```
index.html            18.166 righe — TUTTO il preventivatore, 49 schermate
landing.html             668 righe — la pagina pubblica
withus-one-tokens.css     41 — i token grafici
withus-one-skin.css      230 — la pelle dentro la scocca
withus-pictograms.css     69 — i pittogrammi
ui-test.mjs                   — 177 prove Playwright
server/                       — il backend (Express, ~25 moduli)
scraper/                      — 10 scraper + comune/ + verifica/
supabase/                     — gli script SQL da eseguire a mano
deploy/                       — autopull e canale comandi
```

`index.html` è **un file solo da 18.000 righe**. Non è un incidente: è un
preventivatore che gira anche da telefono, senza compilazione. Ci si lavora
**per numero di riga**, non con sostituzioni di testo: una `.replace()` su una
stringa comune ne colpisce sette punti invece di uno.

### IAM (`francescotp93/Agente-sospesi`)

```
index.html        11.959 righe — le 13 schermate del gestionale
withus-one.js        800 righe — la scocca: barra, menu, router, ponte
withus-one.css       369 righe — lo stile della scocca
verifica/                      — 15 suite di prove
controlla-tutto.mjs            — le lancia tutte
```

Il menu di primo livello: **Scrivania · Nuovo preventivo · Clienti ·
Portafoglio · Contabilità · Agenzia · Strumenti · Amministrazione**.

---

## 4. Il preventivatore, dentro

Le 49 schermate di QUOTO sono `<div class="page" id="page-…">`, una visibile
alla volta, cambiate da `showPage(nome)`.

I prodotti si aprono **per chiave stabile**, non per titolo:

```js
PRODOTTI_DIRETTI = {
  autovetture, motocicli, autocarri, imbarcazioni,
  conducente, storici, cvtard
}
apriProdotto('motocicli')      // ?prod=motocicli
```

La chiave è un nome stabile perché i titoli cambiano: un menu che smette di
funzionare perché è stata rinominata una scheda è un guasto che nessuno collega
alla causa.

### Il censimento anagrafica (lo step che si ripete ovunque)

Tre schermate, una alla volta: **scegli chi c'è già → cerchi → compili**.
«Aggiungi» apre la **ricerca**, non la scheda vuota: è lì che si evitano i
doppioni.

Le regole stanno tutte in `anaValida()`:

- senza codice fiscale, cognome, nome e indirizzo non si salva;
- il codice fiscale è controllato nella forma (16 caratteri, o 11 cifre per gli
  enti);
- con una **partita IVA** compaiono ragione sociale, regime forfettario e SDI —
  togliendola spariscono **e i loro valori non partono**;
- con una partita IVA serve la **PEC oppure lo SDI**;
- un **indirizzo non certificato** avvisa e si conferma solo dalla finestra
  manuale, con la cascata Provincia → Comune → CAP.

L'indirizzo si salva sempre spacchettato (via, civico, CAP, comune, provincia)
con il flag `indirizzo_certificato`.

### Lead

Un **lead** è un nominativo senza privacy firmata (`quote_anagrafiche.lead`).
Si può inserire a mano — bastano nominativo e un recapito, non il codice
fiscale — e quotando auto si **sceglie** se salvarlo: il nominativo non finisce
in archivio da solo.

---

## 5. Il database

Supabase, progetto unico. **Row Level Security attiva su tutte le tabelle.**

| famiglia | tabelle |
|---|---|
| **IAM** | `iam_utenti`, `iam_ticket`, `iam_workdiary`, `iam_team`, `iam_audit`, `iam_kpi_*`, `iam_gare_*`, `iam_trattative`, `iam_conto`, `iam_hub` |
| **QUOTO** | `quote_anagrafiche`, `quote_preventivi`, `quote_polizze`, `quote_titoli`, `quote_documenti`, `quote_sinistri` (+ `_controparti`, `_partite`), `quote_pratica_documenti`, `quote_prodotti_catalogo`, `quote_log` |
| **Posta** | `posta_config`, `posta_notifiche`, `posta_bozze` |

Vincoli che vivono nel database, non nelle schermate:

- **codice fiscale e partita IVA sono unici** (indici parziali: valgono solo
  dove il valore c'è davvero, così i lead senza CF restano legittimi);
- `quote_titoli` sono le rate di una polizza: la contabilità di rata nasce lì.

**Gli script SQL non si eseguono da programma.** Stanno in `supabase/*.sql` e
li lancia una persona nell'editor di Supabase. Sono scritti per essere
rilanciabili senza danni, e per **non lasciare niente a metà**: se trovano
doppioni non applicano l'unicità e dicono quali sono, invece di morire.

---

## 6. Il motore: backend e scraper

Sulla VPS gira un backend Express (`server/`) e **dieci scraper**, uno per
compagnia:

```
allianz  assieasy  axa  groupama  hdi
italiana  kube  leoaccess  moto  prima  quotiamo
```

Ogni scraper è un **browser vero** (Playwright + Chromium su display virtuale)
con un telecomando HTTP su `127.0.0.1`. Il backend gli chiede una quotazione,
lui pilota il portale della compagnia e restituisce il premio.

### Tre cose che chiunque tocchi uno scraper deve sapere

**1. Il freno.** Dopo tre accessi falliti lo scraper **smette di bussare** al
portale e aspetta (15 min, poi il doppio, fino a un'ora). Senza, un login
sbagliato diventa un martellamento che fa bloccare l'utenza dalla compagnia.
Il freno si toglie solo da una persona, dalla rotta `/login` **esatta**.

**2. Le rotte si riconoscono per il nome intero.** `'/logindump'.startsWith('/login')`
è vero: per anni `/logindump` era irraggiungibile e chiamarla eseguiva un
login. Ogni rotta nuova va dichiarata con una guardia esplicita.

**3. Niente dati di clienti verso il browser.** Le fotografie della pagina
(`/shot`, `/dump`, `_text`) passano dalla **ripulitura** (`comune/riservatezza.mjs`):
password mascherate, targhe, date di nascita e codici fiscali oscurati.

### «Fatto» non si dice a vuoto

Uno scraper non deve mai rispondere «ok» quando non ha fatto niente. Se il
portale cambia e non si legge un solo campo, la risposta è
`PORTALE_CAMBIATO`, non un successo con i campi vuoti. Distinguere «ho cercato
e non c'è» da «non ho cercato» è la differenza fra una risposta che si accetta
e una che si va a guardare.

### Le API ufficiali HDI

HDI espone **169 rotte** OAuth2 `client_credentials` (`server/hdiApi.js`).
Il collegamento è **scritto, collaudato e spento**: senza credenziali non
chiama, dice «non configurato». Vedi `HDI-API.md`.

Quando sarà acceso sostituirà lo scraper HDI (2746 righe di browser
pilotato) — ma **solo dopo** che i due danno lo stesso premio su targhe vere.

---

## 7. Come si pubblica

| cosa | dove gira | da quale ramo |
|---|---|---|
| il sito QUOTO | **GitHub Pages** | `main` |
| il sito IAM | **GitHub Pages** | `main` del suo repo |
| backend + scraper | **VPS** | `claude/vibrant-tesla-o0glfd` |

> **Attenzione, è la trappola numero uno.** Frontend e backend seguono **rami
> diversi**. Una modifica a `server/` o `scraper/` pubblicata solo su `main`
> **non arriva alla VPS**. Va pubblicata su entrambi finché non si fa la
> «Fase 3» (spostare la VPS su `main`) — vedi `UNIFICAZIONE.md`.

**Vercel non c'entra più niente**: era configurazione morta, rimossa il
3/8/2026. Se lo vedi nominato da qualche parte, è un residuo.

### Come arriva sulla macchina

`deploy/autopull.sh` gira ogni minuto: tira il ramo, riavvia il backend se è
cambiato `server/`, installa e riavvia gli scraper nuovi. **Ripara da solo**
uno scraper spento o disabilitato — quindi fermarne uno a mano non tiene: torna
su entro un minuto.

---

## 8. Come si lavora qui — le regole che contano

### La disciplina delle prove

**Ogni prova nuova va fatta fallire sul codice di prima.** Non è formalità: una
prova che passa sia prima sia dopo non sorveglia niente, e ci si accorge del
malinteso mesi dopo.

```bash
git worktree add /tmp/prima origin/main --detach
cp ui-test.mjs /tmp/prima/          # le prove NUOVE sul codice VECCHIO
cd /tmp/prima && node ui-test.mjs   # devono essere ROSSE
```

Le suite:

```bash
npx http-server -p 8077 &  &&  node ui-test.mjs   # QUOTO, 177 prove
node scraper/verifica/controlla.mjs               # scraper, 7 suite
node withus-one/verifica/controlla.mjs            # With Us One, 14
cd ../agente-sospesi && node controlla-tutto.mjs  # IAM, 15
```

**Una suite rossa non si pubblica.** Se una prova è rossa su codice corretto,
la prova è sbagliata: pretendeva il *mezzo* invece del *fine*. Si corregge la
prova, non si abbassa la soglia.

### Come si scrive

- **Tutto in italiano**: nomi, commenti, messaggi. `anaValida`, `wdsLunedi`,
  `hdiDatiVeicolo`. Chi legge questo codice lavora in italiano.
- **I commenti dicono PERCHÉ, non cosa.** Il cosa si legge dal codice. Il
  perché — quale difetto reale ha portato lì — no. I commenti buoni qui dentro
  raccontano il guasto: *«getDay() parte da domenica: usarlo così sposta tutta
  la griglia di un giorno, e nessuno se ne accorge perché si guarda la colonna,
  non la data»*.
- **I messaggi d'errore dicono cosa fare**, non cosa è successo.
  Non «errore 23505» ma «esiste già un cliente con questo codice fiscale:
  cercalo e correggi quello».

### Le regole di sicurezza, non negoziabili

1. **Sola lettura sui dati.** Non si scrive su Supabase senza richiesta
   esplicita e conferma.
2. **Nessun invio esterno senza conferma.** Email, campagne, SMS: sempre
   bozza → conferma → invio.
3. **Privacy.** Dati di clienti e collaboratori non escono verso ricerche web o
   servizi esterni.
4. **Backup prima di ogni modifica**: commit di checkpoint o copia `.bak`.
5. **Se manca un dato ufficiale — una soglia, una tariffa, una percentuale, una
   scelta di architettura — non si inventa: si chiede.**
6. **Mai `push` su `main` senza collaudo verde.**
7. **Non si toccano login, pagamenti o segreti** senza richiesta esplicita.
8. **Niente credenziali in chiaro**: solo nei secret.
9. In `index.html` **non si usa `.replace()` su stringhe comuni**: si inserisce
   per numero di riga, e si verifica il conteggio dopo.

---

## 9. Dove guardare quando qualcosa non va

| sintomo | dove si guarda |
|---|---|
| il sito non si aggiorna dopo un rilascio | GitHub Pages: un **collegamento simbolico** nel ramo fa fallire la pubblicazione **in silenzio** |
| una compagnia non quota | Pannello Fonti in QUOTO; poi `/status` dello scraper: dice se è loggato e se il freno è tirato |
| arrivano mail ripetute | `server/fontiWatchdog.js` — la vigilanza. La memoria sta su disco: se la si perde, ricominciano |
| il backend non ha la modifica | è stata pubblicata solo su `main`? Vedi §7 |
| una schermata è vuota | RLS di Supabase: l'utente vede solo quello che il suo ruolo permette |

**I ruoli**: `admin` (vede tutto), `operatore` (esamina e quota le richieste di
tutta la rete), `collaboratore` (crea preventivi e richieste). In IAM:
`top_master`, `master`, `operativo`.

---

## 10. Documenti da leggere, in ordine

| file | cosa contiene |
|---|---|
| `UNIFICAZIONE.md` | perché esistono due rami e come si uniscono. **Leggilo prima di toccare il deploy** |
| `SNELLIRE.md` | 39 proposte verificate per alleggerire il sistema |
| `scraper/FORTIFICAZIONE.md` | 24 lacune degli scraper, verificate una per una |
| `HDI-API.md` | le API ufficiali HDI: cosa manca per accenderle |
| `CODEX.md` | mappa dei file e spartizione del lavoro |
| `INTERFACCIA-QUOTO-IAM.md` | il confine fra le due applicazioni |

---

## 11. Le tre cose che sbaglierai per prime

1. **Pubblicare una modifica al backend solo su `main`** e non capire perché
   sulla macchina non cambia niente. I rami sono due (§7).
2. **Scrivere una prova che passa anche sul codice vecchio.** Non sorveglia
   niente. Falla fallire prima (§8).
3. **Trattare il colore come decorazione.** Qui il verde significa «in regola»
   e l'ambra «da fare». Cambiarli per estetica cambia quello che le schermate
   dicono.
