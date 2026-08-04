# IAM di With Us — definizione del sistema

> **Fonte unica sulla definizione.** Questo file dice *che cosa è* IAM, come si
> chiama, di che cosa è fatto e dove finisce. Gli altri documenti del repository
> dicono *come funziona* e restano validi come allegati tecnici: quando uno di
> loro contraddice questo file, vale questo file.
>
> È identico nei due repository (`francescotp93/QUOTE` e
> `francescotp93/Agente-sospesi`). Ogni modifica va replicata in entrambi nella
> stessa sessione di lavoro.
>
> Scritto il **4 agosto 2026**. I numeri di §7 sono stati misurati quel giorno,
> non ricordati. Il repository è pubblico: qui dentro non entrano indirizzi di
> macchine, chiavi, credenziali né dati di clienti.

---

## 1. In dieci righe

**With Us** è l'agenzia: Withus Assicurazioni.

**IAM** — *Insurance Agency Management* — è il suo sistema. **Uno solo.** Non è
un gestionale affiancato a un preventivatore: è un unico sistema con dentro
tutte le funzioni dell'agenzia, dal primo contatto commerciale fino alla
quadratura contabile e alla campagna di rinnovo.

Chi ci lavora dentro apre **IAM**, e da lì fa tutto. Non passa da un programma
all'altro, non impara due interfacce, non ha due elenchi di clienti.

Sotto il cofano IAM è ancora fatto di due basi di codice e di un motore su una
macchina esterna. **Questo è un dettaglio di costruzione, non un dato di
prodotto**, e §8 dice cosa manca perché smetta di vedersi.

---

## 2. Il nome, e cosa smette di essere un nome

Il nome esposto è uno: **IAM**, di With Us.

L'acronimo non è nuovo — è già scritto nel codice in tre punti
(`QUOTE/index.html:10`, `Agente-sospesi/index.html:6174`,
`Agente-sospesi/withus-one.js:546`): **Insurance Agency Management**. Non va
inventato, va promosso: era il sottotitolo di una delle due applicazioni,
diventa il nome del sistema.

### Cosa smette di essere un nome

| Parola | Che cos'era | Che cos'è adesso |
|---|---|---|
| **QUOTO** | un'applicazione, un marchio, un sottodominio | il **repository** `francescotp93/QUOTE`, e nient'altro |
| **With Us One** | a seconda del documento: la scocca, la piattaforma, o una riscrittura | **niente.** Il nome è ritirato |
| **Agente sospesi** | — | il **repository** `francescotp93/Agente-sospesi` |

Il motivo per cui «With Us One» va ritirato e non riusato: nei documenti attuali
indica tre cose diverse — la barra di navigazione (`CODEX.md` riga 20), una
riscrittura a moduli non pubblicata (riga 21) e l'intera piattaforma
(`CRM.md` §1). Un nome che indica sia un componente sia il tutto non
è un nome: è una fonte di malintesi. I file che lo portano nel titolo
(`withus-one.js`, `withus-one.css`, i token) **non vanno rinominati adesso** —
sono nomi di file interni, e rinominarli tocca centinaia di riferimenti senza
che nessun utente se ne accorga. Il nome sparisce da ciò che si vede, non dal
disco.

> **Regola.** Nell'interfaccia, nei messaggi, nelle email e negli indirizzi si
> legge **IAM**. «Quoto» e «With Us One» non compaiono davanti a un utente.
> Le eccezioni ancora aperte sono elencate in §8.

---

## 3. Chi c'è dentro: i quattro attori

| attore | chi è | cosa fa con IAM |
|---|---|---|
| **L'agenzia** | Withus Assicurazioni: direzione, ufficio, amministrazione | governa il sistema, esamina le richieste, emette, quadra la cassa |
| **La rete** | i collaboratori | quotano, vendono, seguono i propri clienti, vedono la propria produzione |
| **Le compagnie** | le mandanti | non entrano in IAM: IAM entra nei loro portali (§6) |
| **Il cliente finale** | l'assicurato | **oggi quasi niente** — è il vuoto più grande, §8.1 |

I ruoli a database sono `top_master` (direzione), `master` (ufficio),
`operativo` (rete). QUOTO usa storicamente anche `admin` e `collaboratore`, con
una mappatura in `dbRuolo()`/`canonRuolo()`: è debito noto, vedi
`INTERFACCIA-QUOTO-IAM.md` §1.

---

## 4. Le funzioni: un sistema, quattro mestieri

IAM copre quattro mestieri. Non sono moduli da vendere separatamente né
programmi diversi: sono **il modo in cui il lavoro dell'agenzia è organizzato**,
e in IAM si attraversano senza cambiare applicazione.

La colonna «dove vive oggi» dice in quale base di codice sta la funzione. Serve
a chi ci lavora, **non all'utente**: per l'utente è una schermata come le altre.

### 4.1 Commerciale — trovare e seguire

Dal nominativo al contratto.

| funzione | dove vive oggi |
|---|---|
| Lead (nominativo senza privacy firmata) | menu *Clienti → Lead* · `server/lead.js`, `server/iamLead.js` |
| Anagrafiche, con censimento anti-doppione | *Clienti → Anagrafiche* · QUOTO |
| Trattative | *Clienti → Trattative* · IAM |
| Preventivazione, 49 schermate prodotto | *Nuovo preventivo* · QUOTO |
| Richieste all'ufficio | *Agenzia → Richieste* · QUOTO |
| Emissioni | *Agenzia → Emissioni* · QUOTO |
| Firma della proposta | `firma.html`, `server/sign.js` |
| Pagina pubblica e modulo contatti | `landing.html` |

### 4.2 Operativo — tenere in piedi il portafoglio

Quello che succede dopo la firma, e per anni.

| funzione | dove vive oggi |
|---|---|
| Portafoglio polizze | *Portafoglio → Polizze* |
| Scadenzario e rinnovi | *Portafoglio → Scadenzario* |
| Sinistri | *Portafoglio → Sinistri* |
| Documentale | *Clienti → Documenti* |
| Collegamenti alle compagnie | *Strumenti → Fonti* (§6) |
| Collaboratori, agenda, diario, KPI e gare | *Agenzia* |
| Ticket e coda di lavoro | scrivania |
| Utenti, permessi, azienda, agenti AI | *Amministrazione* · `server/assistant.js` |

### 4.3 Contabile — far tornare i conti

| funzione | dove vive oggi |
|---|---|
| Quadratura di giornata | *Contabilità → Quadratura* |
| Anomalie, sospesi, storico movimenti | *Contabilità* |
| Conto ed estratto conto | *Contabilità* |
| Titoli e quietanze (le rate) | *Portafoglio → Titoli* · tabella `quote_titoli` |
| Incassi | `server/pay.js` |

La contabilità di rata **nasce dal titolo**, non dalla polizza: è il vincolo che
tiene insieme portafoglio e cassa.

### 4.4 Marketing — far tornare il cliente

| funzione | dove vive oggi |
|---|---|
| Campagne email | *Strumenti → Campagne email* · `server/marketing.js` |
| Posta e notifiche | *Clienti → Posta* · `server/notify.js`, `server/mail.js` |
| CRM | `server/crm.js` |
| Shop | `server/shop.js` |

**È il mestiere più scoperto dei quattro**, e va detto: quattro moduli backend
per ~800 righe complessive, contro le migliaia della preventivazione. La voce di
menu esiste ed è viva, la sostanza dietro è sottile.

> **Regola non negoziabile sugli invii.** Email, campagne, SMS: sempre
> **bozza → conferma di una persona → invio**. Mai un invio partito da solo.

---

## 5. Sotto le funzioni: il dato

**Un solo database.** Supabase, progetto `ekjxrnsfqxnfxzrthdcf`, con Row Level
Security attiva su tutte le tabelle. Le regole di visibilità stanno nel
database (`quote_vede`, `iam_is_staff`, `iam_is_admin`, `iam_mio_ruolo`), **non
nel browser**: una schermata vuota è quasi sempre un ruolo che non vede, non un
guasto.

I prefissi delle tabelle (`iam_*`, `quote_*`, `posta_*`) sono un residuo storico
della divisione in due applicazioni. **Non vanno rinominati**: rinominare una
tabella in produzione rompe le RLS, le viste e ogni riferimento nel codice, e
non porta nessun beneficio a chi usa il sistema.

Esiste un secondo progetto Supabase chiamato «QUOTE»: è **vuoto e in pausa**.
Il nome inganna, non lo usa nessuno.

Due vincoli vivono nel database e non nelle schermate: **codice fiscale e
partita IVA sono unici** (indici parziali, così i lead senza CF restano
legittimi).

---

## 6. Sotto le funzioni: il motore

Su una VPS OVH (`api.withusassicurazioni.it`) gira un backend Express
(`server/`) e i connettori verso le compagnie.

**Undici connettori**, uno per compagnia: `allianz assieasy axa groupama hdi
italiana kube leoaccess moto prima quotiamo`. Ognuno è un browser vero
(Playwright + Chromium su display virtuale) che pilota il portale della
compagnia e riporta il premio.

> **Undici cartelle esistono; quante siano davvero attive non si sa dal
> codice.** L'elenco delle fonti accese vive in uno store su disco sulla
> macchina, non nel repository. È il motivo per cui i documenti in giro dicono
> «7», «10» e «11» senza che nessuno abbia torto. Vedi §8.5.

Accanto ai portali ci sono le **tariffe proprie** (`tariffe/*.json`: amtrust,
animali, catastrofali, fotovoltaico, malattia, RC professionale, saravintage) e
le **API ufficiali HDI** — 169 rotte OAuth2, scritte e collaudate ma **spente**
finché non danno lo stesso premio dello scraper su targhe vere (`HDI-API.md`).

Tre cose che chiunque tocchi un connettore deve sapere:

1. **Il freno.** Dopo tre accessi falliti smette di bussare e aspetta (15 min,
   poi il doppio, fino a un'ora). Senza, un login sbagliato diventa un
   martellamento che fa bloccare l'utenza dalla compagnia.
2. **Le rotte si riconoscono per il nome intero.** `'/logindump'.startsWith('/login')`
   è vero: per anni chiamare `/logindump` eseguiva un login.
3. **Niente dati di clienti verso il browser.** Le fotografie della pagina
   passano dalla ripulitura (`comune/riservatezza.mjs`).

E una regola sulle risposte: **«fatto» non si dice a vuoto.** Se il portale
cambia e non si legge un campo, la risposta è `PORTALE_CAMBIATO`, non un
successo con i campi vuoti.

---

## 7. I numeri, misurati una volta sola

Al **4 agosto 2026**. Chi ha bisogno di un numero lo prende da qui; gli altri
documenti che ne riportano di diversi sono più vecchi, non più giusti.

| | misura |
|---|---|
| `QUOTE/index.html` | **18.166** righe · **49** schermate prodotto |
| `Agente-sospesi/index.html` | **11.959** righe |
| `Agente-sospesi/withus-one.js` (la scocca) | **800** righe |
| Connettori compagnia (cartelle) | **11** |
| Moduli backend in `server/` | ~40 |
| Prove: `QUOTE/ui-test.mjs` | **155** |
| Prove: `Agente-sospesi/verifica/` | **16** file |

Comando per rifare la misura, così non si discute:

```bash
wc -l QUOTE/index.html Agente-sospesi/index.html Agente-sospesi/withus-one.js
grep -o 'id="page-[a-zA-Z0-9_-]*"' QUOTE/index.html | sort -u | wc -l
ls -d QUOTE/scraper/*/ | grep -vE "_template|comune|verifica" | wc -l
```

---

## 8. Cosa manca perché sia davvero un unico sistema

In ordine di importanza. Ogni voce dice **cosa manca** e **perché conta**, non
come si fa: il come si decide quando si affronta.

### 8.1 Il cliente finale non è nel sistema — *il vuoto più grande*

Degli attori di §3, tre hanno software e uno no. Il cliente compila un modulo su
`landing.html` e firma una proposta su `firma.html`. Poi sparisce.

Non ha un posto dove vedere le proprie polizze, le proprie scadenze, i propri
documenti, né dove aprire un sinistro. Ogni volta che gli serve qualcosa deve
telefonare a un collaboratore, che apre IAM al posto suo.

Finché è così, IAM è il sistema **dell'agenzia**, non **dell'agenzia e dei suoi
clienti**. È una scelta legittima — ma va fatta e scritta, non subita.

### 8.2 Quattro funzioni, ma il marketing è un guscio

§4.4: quattro moduli per ~800 righe, contro le migliaia della preventivazione.
Se «dal commerciale al marketing» deve essere vero, questo è lo squilibrio da
correggere per primo dopo il cliente finale.

### 8.3 Il sistema unico ha ancora due porte d'ingresso

Esistono `iam.withusassicurazioni.it` e `quoto.withusassicurazioni.it`. La
struttura dei domini fotografa la divisione che stiamo superando.

Un unico sistema ha un unico indirizzo. Serve decidere quale — e far diventare
l'altro un rimando, non una destinazione.

### 8.4 La transizione mostra ancora il vecchio nome — *decisione bloccata*

Passando alla preventivazione, IAM mostra oggi una schermata di transizione a
tutto schermo con scritto **QUOTO**. È il punto in cui l'utente vede, nero su
bianco, che i sistemi sono due.

> ⚠️ **Non toccare senza richiesta esplicita.** La grafica di quella schermata è
> bloccata dal `CLAUDE.md` di IAM per volontà dell'utente. Il conflitto con §2 è
> reale ed è segnalato qui perché sia una decisione, non una dimenticanza.

### 8.5 Non si sa quante compagnie sono attive

§6. La verità sta su una macchina, non nel repository, e nessuno può rispondere
alla domanda «con quante compagnie quotiamo» guardando il codice. Per un sistema
che vive dei collegamenti alle compagnie, è un vuoto di governo.

### 8.6 Il doppio cancello sull'accesso

L'accesso alla preventivazione è governato da **due colonne diverse** —
`quoto` (che mostra il pulsante) e `accesso_quoto` (che fa entrare). Abilitarne
una sola produce l'utente che vede il pulsante e viene respinto. Unificarle
elimina la classe di guasti più frequente del confine
(`INTERFACCIA-QUOTO-IAM.md` §5).

### 8.7 Frontend e backend seguono rami diversi

Il sito va da `main`, il motore sulla VPS da `claude/vibrant-tesla-o0glfd`. Una
modifica al backend pubblicata solo su `main` **non arriva alla macchina**, e
non se ne accorge nessuno finché qualcosa non quota. Vedi `UNIFICAZIONE.md`.

### 8.8 Codice di stato ignoto

`api/`, `routes/`, `services/`, `frontend/`, `backend/`, `lab/` esistono nel
repository e nessun documento dice se siano vivi o residui.
`frontend/index.legacy.html` fa pensare a residui: «fa pensare» non è una
risposta.

### 8.9 La sicurezza non fa parte della definizione

`PACCHETTO-FONTI.md` documenta tre problemi **confermati riga per riga**:
password dei portali rimandate al browser da `GET /fonti/:id/auto`; chiave di
cifratura con ripiego nel sorgente; salvataggi notturni con dati dei clienti in
chiaro. Un sistema che tratta dati assicurativi dichiara il proprio livello di
sicurezza dentro la propria definizione, non in un allegato.

### 8.10 Il ciclo di vita del dato del cliente non è definito

Nessuna regola scritta di conservazione, cancellazione e consenso oltre al flag
`lead`. Con GDPR e IVASS è materia del sistema, non del codice.

### 8.11 Una domanda ancora senza risposta

**IAM è il sistema di questa agenzia, o un prodotto che un giorno userà anche
un'altra agenzia?**

Non è una domanda di marketing. Oggi `iam_utenti` ha i ruoli ma **non esiste il
concetto di agenzia**: non c'è multi-tenancy. Se la risposta un giorno fosse
«prodotto», quella scelta andrebbe rifatta su tutto il database, con le RLS già
scritte sopra. Rispondere adesso costa una riga; rispondere dopo costa una
migrazione.

---

## 9. Il perimetro: cosa IAM non è

Un sistema definito dice anche cosa lascia fuori.

- **Non è un sito vetrina.** `landing.html` è un modulo di contatto, non il sito
  dell'agenzia.
- **Non è il sistema delle compagnie.** IAM entra nei loro portali; loro non
  entrano in IAM.
- **Non è un prodotto multi-agenzia** — oggi. Vedi §8.11.
- **Non è una piattaforma di trading di polizze**: non vende in autonomia, un
  contratto passa sempre da una persona.
- **Non è un archivio documentale generico**: conserva i documenti delle
  pratiche, non i documenti dell'azienda.

---

## 10. Le regole che valgono su tutto

1. **Sola lettura sui dati.** Non si scrive su Supabase senza richiesta
   esplicita e conferma.
2. **Nessun invio esterno senza conferma** (§4.4).
3. **Privacy.** Dati di clienti e collaboratori non escono verso ricerche web o
   servizi esterni.
4. **Backup prima di ogni modifica.**
5. **Se manca un dato ufficiale — soglia, tariffa, percentuale, scelta di
   architettura — non si inventa: si chiede.**
6. **Mai `push` su `main` senza collaudo verde**, e una suite rossa non si
   pubblica. Se una prova è rossa su codice corretto, si corregge la prova: non
   si abbassa la soglia.
7. **Ogni prova nuova deve fallire sul codice di prima.** Una prova che passa
   sia prima sia dopo non sorveglia niente.
8. **Non si toccano login, pagamenti o segreti** senza richiesta esplicita.
9. **Tutto in italiano**: nomi, commenti, messaggi. I commenti dicono **perché**,
   non cosa. I messaggi d'errore dicono **cosa fare**, non cosa è successo.
10. In `index.html` **non si usa `.replace()` su stringhe comuni**: si lavora per
    numero di riga e si verifica il conteggio dopo.

---

## 11. Gli altri documenti

Questo file dice *che cosa è* IAM. Gli altri dicono *come funziona*.

| file | cosa contiene |
|---|---|
| `ECOSISTEMA.md` | il sistema tecnico in dettaglio: grafica, token, struttura dei file |
| `CODEX.md` | mappa dei file e spartizione del lavoro |
| `INTERFACCIA-QUOTO-IAM.md` | il confine fra le due basi di codice |
| `UNIFICAZIONE.md` | perché esistono due rami e come si uniscono |
| `PACCHETTO-FONTI.md` | i collegamenti alle compagnie, e i problemi di sicurezza di §8.9 |
| `HDI-API.md` | le API ufficiali HDI: cosa manca per accenderle |
| `SNELLIRE.md` | 39 proposte verificate per alleggerire il sistema |
| `GESTIONALE-COMPLETO.md`, `CRM.md` | analisi precedenti: cosa manca e in che ordine costruirlo |

**Il nome è stato allineato ovunque il 4/8/2026**: nessuno di questi file dice
più «With Us One». `CRM-WITH-US-ONE.md` si chiama ora `CRM.md`.

**I numeri, invece, no.** `GESTIONALE-COMPLETO.md` e `CRM.md` riportano misure
precedenti (~11.500 e ~15.100 righe, 7 scraper, 89 e 9 prove): sono più vecchie,
non più giuste. Per un numero vale §7 di questo file. Il resto del loro
contenuto — l'analisi dei vuoti e l'ordine di costruzione — resta valido.
