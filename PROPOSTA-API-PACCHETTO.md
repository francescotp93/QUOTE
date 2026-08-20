# QUOTO — pacchetto API completo (Fonti e Motor)

**Stato: PROPOSTA. Da approvare prima di scrivere una riga di codice.**
Le API dei prodotti a tariffa sono già fatte e provate: sono descritte in
`CONTRATTO-API.md`. Qui c'è il resto, cioè le due parti di QUOTO che oggi
funzionano solo dentro la sua pagina — il **pannello Fonti** e il
**preventivatore Motor** — trasformate in API che IAM può chiamare.

Regole che restano quelle di prima: stesso involucro, stessa lista chiusa di
errori, stessa chiave interna `X-Internal-Key`, storico e dati cliente solo in
IAM.

---

## 1. Perché serve, in una riga

Oggi IAM per mostrare le Fonti o quotare un'auto deve **aprire la pagina di
QUOTO dentro un riquadro**. Con le API IAM disegna le sue schermate e chiede a
QUOTO solo i dati: una sola interfaccia, un solo posto dove sistemare la grafica,
e QUOTO smette di essere un sito da mostrare e diventa un servizio da chiamare.

---

## 2. FONTI — `/api/v1/fonti`

Le rotte esistono già (`server/fonti.js`, 28 rotte) ma sono dietro il login
utente e hanno ognuna la sua forma. La proposta **non le riscrive**: aggiunge
sopra uno strato sottile che chiama lo stesso codice e restituisce l'involucro
concordato.

### 2.1 Lettura e azioni di accesso — basta la chiave interna

| metodo | rotta | a cosa serve |
|---|---|---|
| GET | `/api/v1/fonti` | elenco fonti con il pallino di stato |
| GET | `/api/v1/fonti/salute` | diagnosi completa: chi è raggiungibile, chi è loggato, cosa manca, cosa fare (`?forza=1` ignora la cache) |
| GET | `/api/v1/fonti/:id` | una fonte sola |
| POST | `/api/v1/fonti/:id/accedi` | avvia l'accesso guidato → `202` |
| GET | `/api/v1/fonti/:id/accesso` | `in_corso` · `serve_codice` · `completo` · `fallito` |
| POST | `/api/v1/fonti/:id/codice` | manda il codice a 6 cifre arrivato per SMS/app |
| POST | `/api/v1/fonti/:id/altro-codice` | chiedi al portale di rimandarlo |
| POST | `/api/v1/fonti/:id/verifica` | prova le credenziali senza aprire una sessione |
| GET | `/api/v1/fonti/vigilanza` | stato del guardiano automatico |
| POST | `/api/v1/fonti/vigilanza/giro` | fai un giro di controllo adesso |

L'accesso guidato segue **lo stesso schema in due tempi delle quotazioni**:
si avvia con una POST che risponde `202`, e si guarda come va con una GET.
Nessuna chiamata resta appesa ad aspettare un uomo che legge un SMS.

```
POST /api/v1/fonti/allianz/accedi        → 202 { success:true, fonte:"allianz", stato:"in_corso" }
GET  /api/v1/fonti/allianz/accesso       →     { success:true, stato:"serve_codice",
                                                 messaggio:"Inserisci il codice ricevuto." }
POST /api/v1/fonti/allianz/codice        → 202 { success:true, stato:"in_corso" }
GET  /api/v1/fonti/allianz/accesso       →     { success:true, stato:"completo", loggato:true }
```

### 2.2 Scrittura — chiave interna **più** il nome di chi ha premuto

Creare una fonte, cambiarla, cancellarla, salvare o togliere le credenziali:

| metodo | rotta |
|---|---|
| POST | `/api/v1/fonti` |
| PUT | `/api/v1/fonti/:id` |
| DELETE | `/api/v1/fonti/:id` |
| POST | `/api/v1/fonti/:id/credenziali` |
| DELETE | `/api/v1/fonti/:id/credenziali` |

Queste **richiedono in più l'intestazione `X-Operatore`** con l'id dell'utente
IAM che ha premuto il pulsante. Senza, la chiamata è rifiutata.

Il motivo. La chiave interna dice «sono IAM», non dice «è stato Francesco». Le
credenziali dei portali compagnia sono la cosa più delicata che abbiamo: se
domani qualcuno legge la chiave, con la chiave sola non deve poter scrivere una
password nel pannello. E quando qualcosa cambia, nel registro dev'esserci un
nome, non un server.

Le password **non escono mai** dalla API: in lettura si dice solo se ci sono
(`ha_password: true`), esattamente come fa oggi il pannello.

### 2.3 Due errori nuovi nella lista chiusa

Oggi la lista è `PROVIDER_UNAVAILABLE · INVALID_INPUT · TIMEOUT · AUTH_FAILED`.
Le Fonti ne chiedono due:

- **`NOT_FOUND`** — la fonte non esiste. Oggi finirebbe in
  `PROVIDER_UNAVAILABLE`, che vuol dire un'altra cosa e manda a cercare un
  guasto che non c'è.
- **`FORBIDDEN`** — scrittura senza `X-Operatore`.

Aggiungere codici a una lista chiusa è un cambio di contratto: va deciso adesso,
non dopo, perché IAM li tratterà come definitivi.

---

## 3. MOTOR — `/api/v1/quote/motor`

### 3.1 Prima di tutto: la condizione che hai posto

Il Motor non rientra in scope finché non esiste uno script che esegue una
quotazione vera dall'inizio alla fine, risponde passa / non passa e gira da riga
di comando senza che nessuno guardi lo schermo. **Quello è il primo lavoro sul
Motor**, prima di qualunque riparazione e prima della API.

Deliverable 1: `server/verifica/motor-e2e.test.mjs`

- prende una targa vera di prova e un profilo cliente fisso;
- chiama i preventivatori uno per uno;
- passa se almeno una compagnia restituisce un premio credibile (> 50 €) e
  nessuna risponde con una pagina di errore;
- stampa per ogni compagnia: premio, secondi impiegati, oppure il motivo del
  fallimento;
- esce con `0` o `1`, e basta guardare quello.

Finché quello script non è verde, la API Motor non si scrive.

### 3.2 Il contratto, per quando ci arriveremo

Uguale a quello dei prodotti: due tempi, stesso involucro.

```
POST /api/v1/quote/motor  { targa, cliente:{...}, compagnie:["prima","axa","allianz"] }
  → 202 { success:true, quote_id:"…", stato:"in_corso" }

GET  /api/v1/quote/{quote_id}
  → { success:true, prodotto:"motor", stato:"in_corso",
      progresso:[ {compagnia:"prima", stato:"completo", premio_annuo:412.90},
                  {compagnia:"axa",   stato:"in_corso"},
                  {compagnia:"allianz", stato:"fallito", errore:"AUTH_FAILED"} ] }
```

Tre scelte da approvare:

1. **Risultati parziali.** Il Motor interroga più compagnie in parallelo e
   qualcuna ci mette minuti. Proposta: `stato: "in_corso"` con dentro i premi già
   arrivati, così IAM riempie la tabella mano a mano invece di mostrare una
   clessidra per tre minuti. È diverso dai prodotti a tariffa, dove il risultato
   o c'è o non c'è.
2. **Una compagnia giù non fa fallire il preventivo.** Se Allianz non risponde,
   il preventivo resta valido con le altre e Allianz risulta `fallito` con il
   suo motivo. Fallisce tutto solo se falliscono tutte.
3. **Visura targa separata.** `GET /api/v1/veicolo/:targa` → marca, modello,
   allestimento, alimentazione. Serve anche da sola (IAM la usa per riempire una
   scheda senza quotare), e mescolarla alla quotazione vorrebbe dire rifarla ogni
   volta.

---

## 4. Cosa resta fuori, e perché

- **Le pagine di QUOTO.** Le API non sostituiscono il preventivatore a schermo:
  restano tutti e due, sugli stessi moduli di calcolo. Quello che non deve più
  succedere è che IAM mostri QUOTO dentro un riquadro.
- **Lo storico.** I preventivi si salvano in IAM. QUOTO tiene log tecnici a
  breve conservazione, non archivi di clienti. Un solo posto da presidiare.
- **Le costanti di calcolo.** Restano dove sono. IAM non ne tiene copia.

---

## 5. Ordine dei lavori proposto

| # | cosa | quanto | dipende da |
|---|---|---|---|
| 1 | Fonti — lettura e azioni di accesso (§2.1) | mezza giornata | niente |
| 2 | Fonti — scrittura con `X-Operatore` (§2.2) | mezza giornata | la tua risposta su `X-Operatore` |
| 3 | Motor — script di verifica end-to-end (§3.1) | un giorno | credenziali AXA/Allianz funzionanti |
| 4 | Motor — API (§3.2) | un giorno | il punto 3 verde |
| 5 | RC professionale come API | un giorno | niente |

---

## 6. Le tre risposte che mi servono

1. `X-Operatore` obbligatorio per scrivere credenziali: **sì** o **no**?
2. `NOT_FOUND` e `FORBIDDEN` nella lista chiusa degli errori: **sì** o **no**?
3. Motor con risultati parziali mentre le compagnie rispondono: **sì** o **no**?
