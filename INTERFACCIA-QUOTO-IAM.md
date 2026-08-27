# CONTRATTO DI INTERFACCIA — QUOTO ⇄ IAM

> **Fonte unica della verità sul confine tra le due app.**
> Questo file è identico nei due repository (`francescotp93/QUOTE` e
> `francescotp93/Agente-sospesi`). Ogni modifica a un punto di contatto
> elencato qui **deve essere replicata in entrambi i repo nella stessa
> sessione di lavoro**, altrimenti l'integrazione si rompe e sembra che
> "uno dei due progetti abbia perso le modifiche".

## Le due app
- **IAM** (`Agente-sospesi`) → gestione utenti/agenti, pubblicato su GitHub Pages.
- **QUOTO** (`QUOTE`) → quotatore multi-compagnia, pubblicato su
  `https://francescotp93.github.io/QUOTE/`.
- **Backend condiviso:** stessa istanza **Supabase** (Auth + tabella
  `iam_utenti`). Sono due codebase separate ma **un solo database**.

---

## 1. Database condiviso — tabella `iam_utenti`

Colonne che fanno parte del contratto (toccarle impatta entrambe le app):

| Colonna | Tipo | Chi la SCRIVE | Chi la LEGGE | Significato |
|---|---|---|---|---|
| `ruolo` | text | IAM + QUOTO | IAM + QUOTO | `top_master`/`master`/`operativo` (canonici IAM). ⚠ QUOTO scrive/legge anche `admin`/`collaboratore` via `dbRuolo()`/`canonRuolo()` — tenere coerente la mappatura. |
| `quoto` | bool | IAM (toggle ON/OFF utente) | **IAM** | Mostra/nasconde il bottone `nb-quoto` nella navbar IAM. |
| `accesso_quoto` | bool | IAM + QUOTO | **QUOTO** | Permette/blocca il login dentro l'app QUOTO. |
| `accesso_iam` | bool | QUOTO (insert nuovo utente) | IAM | Accesso lato IAM. |
| `attivo` | bool | IAM + QUOTO | entrambe | Account sospeso se `false`. |

### ⚠️ DOPPIO CANCELLO — il punto più fragile
L'accesso a Quoto è gestito da **due colonne diverse**:

- **IAM** mostra il bottone Quoto quando `quoto === true`
  (`Agente-sospesi/index.html`, ~riga 4990).
- **QUOTO** fa entrare l'utente quando `accesso_quoto === true`
  (`QUOTE/index.html`, ~righe 1793 e 9019).

Se ne abiliti **una sola**, l'utente vede il bottone in IAM ma riceve
*"Il tuo account non ha accesso a QUOTO"*, oppure ha accesso ma senza
bottone.

> **REGOLA:** quando abiliti/disabiliti un utente a Quoto, imposta
> **sia `quoto` sia `accesso_quoto` allo stesso valore**.
> (Ideale futuro: unificare in un'unica colonna — vedi sezione 5.)

---

## 2. Handshake IAM → QUOTO

Il preventivatore si apre **dentro** IAM, in `<iframe id="w1-qframe">`
(`Agente-sospesi/withus-one.js`). IAM e QUOTO sono **origini diverse**
(`iam.` e `quoto.`), quindi la sessione va passata esplicitamente.

### 2.1 Come passa la sessione — il canale (strada normale)

La sessione viaggia **da finestra a finestra**, non dentro l'indirizzo.

| Passo | Chi | Messaggio | `targetOrigin` |
|---|---|---|---|
| 1 | QUOTO, appena caricato | `{ w1:'quoto-ready', v:1 }` a `window.parent` | `https://iam.withusassicurazioni.it` |
| 2 | IAM, in risposta | `{ w1:'quoto-session', v:1, at, rt, email, page, prod, q }` all'iframe | `https://quoto.withusassicurazioni.it` |
| 3 | IAM, a ogni voce di menu | `{ w1:'quoto-nav', v:1, page, prod, q }` all'iframe | `https://quoto.withusassicurazioni.it` |

**Regole non negoziabili del canale**

- Chi **manda** dichiara sempre l'origine di destinazione. Mai `'*'`.
- Chi **riceve** verifica `event.origin` contro una lista chiusa **e**
  `event.source` (`window.parent` lato QUOTO, `iframe.contentWindow` lato IAM)
  **prima** di guardare il contenuto del messaggio.
- Il passo 1 si ripete ogni 300 ms finché non arriva risposta: non si sa chi
  dei due aggancia per primo il proprio ascoltatore.
- Se entro 4 s non risponde nessuno, QUOTO prosegue da solo: resta il velo
  `#boot-screen` e dopo 10 s `bootSalvagente()` apre la schermata di accesso.

### 2.2 Cosa resta nell'indirizzo del riquadro

`https://quoto.withusassicurazioni.it/?from=iam&page=<pagina>&prod=<prodotto>`

- `from=iam` → accende la veste dentro IAM (`html.emb-iam`) e il tasto
  «Torna a IAM».
- `page`, `prod` → quale schermata aprire subito, per non far vedere quella
  sbagliata per un istante.
- **Non ci sono più:** `at`, `rt` (token), `email` (dato personale),
  `q` (testo cercato: quasi sempre nome o codice fiscale di un cliente).
  Un indirizzo lo leggono la cronologia, gli strumenti per sviluppatori e
  **ogni script caricato nella pagina**, comprese le librerie di terze parti:
  non è un canale privato e non deve trasportare credenziali né dati di persone.

### 2.3 Chi può incorniciare QUOTO

La facciata di QUOTO sta su GitHub Pages, che **non permette header di
risposta**: niente `Content-Security-Policy: frame-ancestors`, niente
`X-Frame-Options`. Finché è così la guardia sta **nella pagina**
(`QUOTE/index.html`, primo `<script>` del `<head>`): se QUOTO è dentro un
riquadro e il referrer non è `iam.` o `quoto.`, la pagina non parte.
Fallisce **chiusa**: referrer assente = rifiuto.

L'iframe lato IAM porta `referrerpolicy="origin"` — serve esattamente a far
funzionare quella guardia — e `allow=""`, che toglie al riquadro fotocamera,
microfono, posizione e pagamenti.
`sandbox` **non** è impostata: QUOTO ha bisogno di `allow-scripts` e
`allow-same-origin` insieme, che annullano quasi tutta la protezione; le voci
utili vanno collaudate una per una (pagamenti, scarico PDF, stampa).

> Se un domani QUOTO passa dietro nginx/Vercel, il posto giusto per la regola
> diventa l'header: `Content-Security-Policy: frame-ancestors
> https://iam.withusassicurazioni.it` + `Referrer-Policy: strict-origin-when-cross-origin`.
> La guardia nella pagina resta come seconda rete.

### 2.4 Strada residua — il salto a pagina intera

`quotoUrl()` (`Agente-sospesi/index.html`) allega ancora i token nell'hash
`#at/#rt`. Serve a **un caso solo**: il collaboratore con
`accesso_iam = false` e `accesso_quoto = true`, che salta direttamente su QUOTO
senza scocca — lì non esiste una finestra padre con cui parlare.
QUOTO legge ancora l'hash come **compatibilità** (`initDB`), e lo ripulisce
prima di qualsiasi chiamata di rete.

Le due uscite possibili, da decidere:
- **(a)** togliere il ponte per quel caso: il collaboratore fa il normale
  accesso su QUOTO con l'email già scritta. Costo: una password digitata.
- **(b)** biglietto monouso: IAM chiede a `withus-backend` un ticket opaco a
  scadenza breve, QUOTO lo scambia lato server per la sessione. Nell'indirizzo
  passa un valore che vale una volta sola e pochi secondi.

Finché la scelta non è fatta, l'hash resta **solo** su questa strada.

### 2.5 Ordine di rilascio (il ponte cambia su due lati)

1. **QUOTO per primo.** Accetta il canale **e** l'hash: funziona sia con la
   scocca vecchia sia con quella nuova. Nessuna finestra di rottura.
2. **IAM per secondo.** Smette di mettere token, email e testo cercato
   nell'indirizzo e passa al canale.
3. **Solo dopo**, e solo quando il punto 2.4 è deciso, si toglie da QUOTO il
   blocco di compatibilità hash.

Invertire 1 e 2 rompe la produzione: IAM smetterebbe di mandare i token a un
QUOTO che non sa ancora ascoltare il canale.

> **REGOLA:** i nomi dei messaggi (`quoto-ready`, `quoto-session`, `quoto-nav`),
> i campi (`w1`, `v`, `at`, `rt`, `email`, `page`, `prod`, `q`), le origini
> ammesse e i parametri rimasti nell'indirizzo (`from`, `page`, `prod`) sono
> parte del contratto. Si cambiano **solo modificando entrambi i repo**.

---

## 3. Sessione condivisa
Stessa istanza Supabase Auth. **Attenzione:** dopo il passaggio ai domini
personalizzati IAM e QUOTO stanno su sottodomini diversi
(`iam.withusassicurazioni.it` e `quoto.withusassicurazioni.it`) → **origin
diversi**, quindi il browser **non condivide più** il login automaticamente
(prima funzionava perché erano entrambi su `francescotp93.github.io`).
La sessione viene quindi "passata" esplicitamente da IAM a QUOTO **sul canale
postMessage** (vedi sezione 2), non più nell'indirizzo. Non introdurre
logout/redirect che invalidino la sessione attraversando il confine.

---

## 4. Checklist prima di toccare un punto di contatto
- [ ] Tocchi una colonna condivisa? Aggiorna **sia IAM sia QUOTO** (ricorda il doppio cancello `quoto` + `accesso_quoto`).
- [ ] Cambi URL o parametri del redirect? Aggiorna **entrambi i repo**.
- [ ] Hai committato sul ramo che viene **effettivamente pubblicato**? (vedi nota sui rami divergenti qui sotto).
- [ ] Il login di entrambe le app funziona ancora dopo la modifica?

---

## 5. Note aperte / debito tecnico
- **Unificare il cancello** `quoto` + `accesso_quoto` in un'unica colonna
  eliminerebbe la classe di bug più frequente del confine.
- **Rami divergenti:** `main` e `claude/...` dei due repo sono divergenti;
  assicurarsi di lavorare e pubblicare sempre dallo stesso ramo, altrimenti
  le modifiche sembrano "non salvate". Vedi gli agenti in `.claude/agents/`.
