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

## 2. Handshake del redirect IAM → QUOTO

- **IAM:** `goTab('quoto')` mostra una splash fullscreen e poi reindirizza a
  `https://francescotp93.github.io/QUOTE/?from=iam`
  (`Agente-sospesi/index.html`, ~riga 2702).
  🔒 **BLOCCATO** dal `CLAUDE.md` di IAM: non modificare splash/redirect
  senza richiesta esplicita dell'utente.
- **QUOTO:** legge `?from=iam` → salva `sessionStorage['quoto_from_iam']='1'`
  → dopo il login mostra il bottone **"Torna a IAM"**
  (`QUOTE/index.html`, ~righe 1764 e 1801).
- Parametro opzionale `?email=` → QUOTO precompila il campo email del login
  (`QUOTE/index.html`, ~riga 1766).

> **REGOLA:** l'URL del redirect e i nomi dei parametri (`from`, `email`)
> sono parte del contratto. Si cambiano **solo modificando entrambi i repo**.

---

## 3. Sessione condivisa
Stessa istanza Supabase Auth + stesso dominio `francescotp93.github.io`:
la sessione di autenticazione è condivisa, quindi chi è loggato in IAM
risulta loggato anche in QUOTO. Non introdurre logout/redirect che
invalidino la sessione attraversando il confine.

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
