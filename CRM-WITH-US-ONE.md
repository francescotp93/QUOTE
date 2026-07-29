# CRM WITH US ONE — specifica di costruzione

> **Come si usa questo file.** È autosufficiente: mettilo nella radice del repo
> `francescotp93/QUOTE` (dove già sta) e in una sessione Claude Code scrivi
> *"leggi CRM-WITH-US-ONE.md e fai il punto X"*. È scritto come **analisi dei
> vuoti**, non come progetto da zero: dice cosa esiste già, cosa manca e in che
> ordine costruirlo. Non contiene codice, testi, documenti o grafica di terzi.
>
> **Non affrontare più di un punto per volta.** Ogni punto si chiude con
> collaudo verde e pubblicazione, poi si passa al successivo.

---

## 0. Due avvertenze che valgono più di tutto il resto

Questa specifica nasce dallo studio di un portale concorrente (Plurima /
Italnext) fatto da Francesco. Due indicazioni emerse da quello studio **non
vanno seguite**, e il motivo è importante:

**0.1 — Niente riscrittura in un framework.** Lo studio suggeriva
Next.js + Prisma da zero. WITH US ONE è **~27.000 righe funzionanti e in
produzione** (IAM ~11.500 + QUOTO ~15.100), su HTML monolitico + Supabase +
un backend Node su VPS con 7 scraper di compagnia. Riscrivere significa
fermare l'azienda per mesi e rifare da capo tutte le integrazioni con le
compagnie, che sono la parte più costosa e più fragile. **Si costruisce dentro
quello che c'è.** Se in futuro una singola area meriterà un framework, si
migrerà quella, da sola, quando sarà isolata.

**0.2 — Niente palette del concorrente.** Lo studio riportava i colori del
portale osservato (magenta/bordeaux `#7E155C`, blu, ciano). Usarli sarebbe uno
sbaglio doppio: cancella il marchio With Us e ci mette dentro l'identità di un
altro — che è anche l'unica parte davvero protetta da copyright. **I colori
sono quelli di With Us**, già codificati in `withus-one-tokens.css` (§3).

Regola generale sul piano legale: **replicare funzioni e flussi è lecito**
(sono idee e prassi di mercato); copiare testi, PDF, condizioni contrattuali,
grafica o codice non lo è. Tutto qui è descritto per funzione, non per forma.

---

## 1. Che cos'è WITH US ONE, oggi

Un'unica piattaforma per Withus Assicurazioni e la sua rete di collaboratori,
nata dall'unificazione di due applicazioni:

| | provenienza | contenuto |
|---|---|---|
| **IAM** | `francescotp93/Agente-sospesi` | scrivania, contabilità collaboratori, ticket, KPI/gare, diario di lavoro, trattative, team |
| **QUOTO** | `francescotp93/QUOTE` | preventivatore multi-compagnia, anagrafiche, storico, emissioni, richieste, sinistri, fonti |

Impianto tecnico:

- **Facciata**: due `index.html` monolitici + la scocca `withus-one.js` /
  `withus-one.css` (tre barre: intestazione, menu scuro con mega-menu, barra
  titolo con briciole). Pelle grafica in `withus-one-skin.css`, valori in
  `withus-one-tokens.css`.
- **Dati**: Supabase (progetto `ekjxrnsfqxnfxzrthdcf`), 40 tabelle, RLS attiva
  su tutte.
- **Backend**: Node su VPS OVH (`api.withusassicurazioni.it`, porta interna
  3000) + 7 scraper di compagnia con sessione persistente su disco;
  auto-deploy da git ogni minuto (`deploy/autopull.sh`).
- **Preventivi**: una funzione Vercel (`/api/*`) per la parte tariffaria.

Il **dominio unico** (tutto sotto `iam.withusassicurazioni.it`, servito dal
VPS) è la Fase 1 dell'unificazione: pacchetto pronto in
`deploy/DOMINIO-UNICO.md`, in attesa del cambio DNS. Finché non è attivo,
QUOTO gira in un riquadro cross-dominio — e da lì nascono i bug di sessione
già corretti (vedi §9.4).

---

## 2. Che cosa esiste già nei dati (verificato, non presunto)

Interrogato Supabase il 29/07/2026. **Questo è il punto di partenza reale:
non reinventare ciò che c'è.**

### Già c'è e funziona

| tabella | righe | copre |
|---|---|---|
| `quote_anagrafiche` | 35 | clienti: tipo, CF/P.IVA, ragione sociale, professione, stato civile, indirizzo completo, contatti, PEC, **documenti (json)**, doc. identità, **privacy_firma** |
| `quote_preventivi` | 66 | preventivi: modulo, prodotto, compagnia, premio, cliente_id, **stato**, **offerta**, **compagnie_sel**, **coperture**, dati (json) |
| `quote_prodotti_catalogo` | 8 | catalogo: ramo, codice, nome, **tipo_quotazione**, compagnie, **campi_offerta** |
| `quote_sinistri` | 0 | modello completo e ben fatto (numero, luogo, date, controparte, danni persone/cose, documenti, **storia**, stato) — **mai usato** |
| `quote_documenti` | 0 | documentale **di prodotto** (prodotto, descrizione, url, compagnia) |
| `quote_collaboratori` | 2 | collaboratori: CF, **rui_numero**, **rui_data**, **veste**, attivo |
| `iam_utenti` | 5 | utenti: ruolo, attivo, accesso_iam, accesso_quoto, **moduli**, **permessi (json)**, rete, responsabile |
| `iam_ticket` | 33 | ticket di IAM |
| `quote_ticket` | 5 | ticket di QUOTO — **doppione da unificare** |
| `iam_trattative` | 23 | pipeline commerciale |
| `iam_conto` | 2 | conto collaboratori |
| `iam_kpi_*`, `iam_gare_*`, `iam_obiettivi` | 42 | KPI, gare, obiettivi |
| `iam_workdiary` | 198 | diario di lavoro |
| `iam_audit`, `quote_log` | 340 | tracciamento attività |

Tre cose sono **già più avanti** di quanto lo studio suggerisse di costruire:

1. `quote_prodotti_catalogo.tipo_quotazione` — la doppia modalità
   *quotazione autonoma* vs *richiesta all'ufficio* **esiste già**. Era
   indicata come "la scelta architetturale più importante da replicare":
   è già vostra, va solo estesa dagli 8 prodotti attuali a tutto il catalogo.
2. `quote_prodotti_catalogo.campi_offerta` — l'impianto per una form guidata
   da metadati (campi diversi per prodotto, senza pagine scritte a mano)
   **è già impostato**.
3. `quote_collaboratori.rui_numero` / `rui_data` / `veste` — la gestione della
   rete con validazione RUI **c'è già in embrione**.

### Manca del tutto — ed è il vuoto numero uno

**Non esiste la POLIZZA come entità.** Oggi vive come due colonne dentro
`quote_preventivi`: `polizza_emessa` (sì/no) e `polizza_il` (data). Il resto
non c'è: niente numero di polizza, **niente data di scadenza**, niente
frazionamento, niente tacito rinnovo, nessun collegamento con gli incassi.

Le conseguenze pratiche sono grosse e a cascata:

- **Impossibile fare lo scadenzario e i rinnovi** — non c'è una data di
  scadenza da cui partire. Ed è il lavoro che porta più soldi in un'agenzia.
- Impossibile avere il portafoglio come cruscotto (chi ha pagato, chi ha
  firmato, chi è coperto).
- Impossibile la contabilità di rata: non esistono i **titoli** (prima rata,
  quietanza, appendice), quindi né incassi né estratti conto provvigionali.
- I **beni del cliente** (veicoli, immobili) non sono entità riutilizzabili:
  vivono dentro il json del singolo preventivo e vanno ridigitati ogni volta.
  (`quote_catalogo_veicoli` esiste ma è vuota.)
- Il **documentale di pratica** non c'è: `quote_documenti` è il documentale di
  prodotto. Manca la checklist "cosa manca per perfezionare questa polizza".

**Da qui parte tutto il piano.** Senza la tabella delle polizze, metà delle
funzioni descritte più sotto non sono costruibili.

---

## 3. Sistema grafico — i valori sono già scritti

Fonte unica: **`withus-one-tokens.css`** (già nel repo). Chi disegna un
componente non scrive mai un colore a mano: usa `var(--w1-…)`.

```css
/* colori del marchio */
--w1-verde:#02984e;        /* azioni, evidenze, marchio */
--w1-verde-vivo:#01c061;   /* accenti luminosi, spie */
--w1-verde-scuro:#016b38;  /* hover bottoni, testo su fondo tenue */
--w1-verde-medio:#2fb56f;  /* tinte intermedie */
--w1-verde-tenue:#eaf7f0;  /* fondi di badge, righe evidenziate */
--w1-verde-tenue2:#d9f0e3;
/* neutri */
--w1-scuro:#1b2733;        /* barra scura della scocca */
--w1-sfondo:#eef1f4;       /* fondo pagina */
--w1-bordo:#dde3e9;        /* bordi contenitori */
--w1-bordo2:#e9edf1;       /* bordi leggeri, righe tabella */
--w1-testo:#1f2a37;        /* testo principale */
--w1-testo2:#5a6b7c;       /* testo secondario, etichette */
--w1-testo3:#8b9aa9;       /* testo attenuato, briciole */
/* forma e misure */
--w1-raggio:4px;           /* angoli squadrati */
--w1-testo-base:13px;
--w1-focus:0 0 0 3px rgba(2,152,78,.14);
/* ombre */
--w1-ombra-sm / -md / -lg
```

**Impostazione visiva** (già applicata): squadrata, piatta, densa. Angoli 4px,
testo base 13px, etichette in **maiuscoletto 10,5px peso 700 lettera spaziata**,
intestazioni di tabella su fondo `#f6f8fa` in maiuscoletto, bottoni piatti
senza ombra, righe di tabella separate da bordi leggeri.

**Colori semantici** solo per gli stati (mai decorativi):
verde = fatto/pagato/attivo · giallo = in attesa/sospeso · rosso =
mancante/insoluto/scaduto · grigio = non applicabile.

**Regola tecnica**: `withus-one-tokens.css` va caricato **prima** di
`withus-one-skin.css` (altrimenti le variabili sono vuote — c'è una prova che
lo verifica). Obiettivo aperto: far leggere gli stessi token anche a
`withus-one.css` della scocca IAM, per svuotare le 58 regole `!important`
rimaste nella pelle.

---

## 4. Regole di ingaggio (non negoziabili)

1. **Backup prima di ogni modifica**: commit-checkpoint o copia `.bak`. Si
   deve poter tornare indietro in un attimo.
2. **Chiedere invece di inventare**: se manca un dato ufficiale (una soglia,
   una tariffa, una percentuale, una scelta di architettura), si chiede a
   Francesco. Mai un numero inventato in un calcolo economico.
3. **Mai `push` su `main` senza collaudo verde** — da `main` parte la
   produzione.
4. **Non toccare login, pagamenti o segreti** senza richiesta esplicita.
5. **Niente credenziali in chiaro**: solo nei secret (VPS `.env`, Supabase,
   GitHub).
6. **Sui dati: solo lettura** salvo richiesta esplicita e conferma. Mai dati di
   clienti o collaboratori incollati in ricerche web o servizi esterni.
7. **Mai `.replace()` su stringhe comuni dentro `index.html`**: `</head>` e
   `</body>` compaiono **anche dentro il codice JS** che genera stampe PDF ed
   Excel. Un inserimento "innocuo" ne ha già colpiti 6 invece di 1 e ha rotto
   l'app. **Si inserisce per numero di riga**, e si verifica il conteggio dopo.
8. **Ogni punto aggiunge le sue prove.** Se sposti o crei una funzione, scrivi
   la prova che dimostra che risponde.

### Collaudo (comandi reali)

```bash
# QUOTO — suite Playwright, deve restare tutta verde e senza errori JS
node static-server.js &     # serve il repo sulla porta 8077
node ui-test.mjs            # login simulato, Supabase e API finti

# IAM — suite nel repo Agente-sospesi
node controlla-tutto.mjs
```

Riferimento al 29/07/2026: **QUOTO 50/50 · IAM 9/9**. Non "quasi verde":
verde. Se una prova diventa rossa, si sistema prima di andare avanti.

---

## 5. I pattern che vale la pena replicare

Dallo studio del portale concorrente, in ordine di valore concreto. Sono
**idee**, da realizzare con codice e grafica vostri.

**5.1 Quattro stati indipendenti per polizza, con semaforo in lista.**
Non un solo stato, ma quattro dimensioni che avanzano separatamente:
*Pagamento* (non pagato → sospeso → pagato), *Perfezionamento* (documenti
completi sì/no), *Rendicontazione* (da incassare → da rendicontare →
liquidata), *Copertura* (attiva da quando). In lista, quattro pallini per
riga con spiegazione al passaggio del mouse e legenda sempre visibile sopra la
tabella. È ciò che rende leggibile in un colpo d'occhio una pratica che
avanza su più fronti — il singolo pattern con il miglior rapporto tra valore e
fatica.

**5.2 Checklist "cosa manca" calcolata sulla pratica.** Non una cartella
allegati generica, ma l'elenco di ciò che serve *a questa polizza* per essere
perfezionata (presa visione, polizza firmata, privacy, documento d'identità),
con distinzione firmato / non firmato / mancante. Il documento non è un file:
è un requisito con uno stato.

**5.3 Doppia modalità per prodotto: autonoma o su richiesta.** Ogni prodotto
dichiara subito la strada — si quota da soli, oppure si apre una richiesta
all'ufficio. Il preventivatore copre i rischi standard, il ticketing copre
tutto il resto, e il collaboratore non deve indovinare. **Già presente**
(`tipo_quotazione`): va esteso a tutto il catalogo.

**5.4 Degradare invece di bloccare.** Se mancano dati per emettere in
autonomia, il sistema non dice "non puoi": instrada la pratica in
autorizzazione e lo spiega. Vale per ogni vincolo (dati incompleti, formazione
prodotto non acquisita, fido esaurito).

**5.5 Beni del cliente come entità riutilizzabili.** Veicoli, immobili,
attività, imbarcazioni, animali appartengono al cliente, non al preventivo: si
scelgono da un elenco invece di essere ridigitati. Abbatte la digitazione e i
suoi errori.

**5.6 Arricchimento da fonti esterne.** Targa → veicolo, CF/P.IVA →
anagrafica, normalizzazione indirizzo (provincia → comune → CAP a cascata con
conferma), visure. Ogni campo che arriva da una fonte esterna è un campo che
nessuno sbaglia. Attenzione: le visure spesso si pagano a chiamata — vanno
messe dietro un'azione esplicita, mai automatiche, e mai eseguite nei collaudi.

**5.7 Ricerca globale che cerca bisogni, non parole.** Digitando "medico" si
trova il prodotto per le professioni sanitarie. È una mappa
sinonimo/esigenza → prodotto, non una ricerca testuale. Il campo suggerisce
esempi a rotazione per insegnare cos'è possibile chiedere.

**5.8 Ticketing come modulo vero, non come casella di posta.** Ticket
collegabile a cliente, polizza, preventivo e prodotto; stati configurabili con
un codice tecnico stabile; **data di schedulazione** (il ticket può essere
pianificato nel futuro, quindi è anche gestione delle attività); conversazione
con allegati; e il conteggio dei ticket collegati mostrato sugli oggetti
correlati.

**5.9 Scadenzario che mostra l'avanzamento, non solo le date.** Per ogni
polizza in scadenza: è già stata riquotata? quale preventivo la sostituisce?
quanti ticket ha aperti? È la differenza tra una lista di scadenze e uno
strumento di lavoro sui rinnovi.

**5.10 Notifiche come eventi con contenuto, non messaggi generici.** "Polizza
emessa" con link al documentale, "pagamento ricevuto" con cliente, importo e
mezzo, "estratto conto liquidato" con IBAN e riferimento del bonifico. Da
aggiungere: l'avviso di manutenzione dei sistemi di compagnia — evita una
montagna di segnalazioni inutili quando uno scraper è giù per causa loro.

**5.11 Sostituzione come relazione, non come modifica.** Sostituire una
polizza genera un nuovo record che *punta* a quello sostituito, con premio
riproporzionato sul periodo residuo. Non si sovrascrive mai la storia.

**5.12 Export su ogni lista.** Excel per le liste di lavoro, PDF per i
documenti contabili. Se una lista non si può esportare, qualcuno la ricopia a
mano.

**5.13 Separazione netta delle aree.** *Portafoglio* (il cliente e i suoi
contratti) · *Contabilità* (i soldi) · *Amministrazione* (la mia posizione
come intermediario). Non si sovrappongono. La scocca WITH US ONE è già
impostata così.

### Tre cose da fare meglio del portale osservato

- **Timeline unica sul cliente.** Là ci sono sei schede separate e manca la
  vista cronologica di tutto ciò che è successo con quel cliente. In un CRM è
  il cuore: `iam_audit` e `quote_log` (340 righe già registrate) sono la
  materia prima per costruirla.
- **Filtri per colonna salvabili come viste.** Una sola ricerca globale non
  regge quando le righe crescono.
- **Conferma con riepilogo sulle azioni impegnative** (chiusura estratto
  conto, comunicazione di incasso): prima di eseguire, mostrare cosa succederà.

---

## 6. Piano di costruzione, in ordine di dipendenza

Ogni punto è pubblicabile e reversibile da solo. **Non iniziare il punto
successivo prima di aver chiuso quello in corso con collaudo verde.**

### Punto 1 — La polizza diventa un'entità *(sblocca tutto il resto)*

Nuove tabelle, convenzione di nome `quote_*` come le esistenti:

- **`quote_polizze`** — cliente_id, preventivo_id, prodotto_id, compagnia,
  numero_polizza, data_effetto, **data_scadenza**, frazionamento, tacito
  rinnovo, premio annuo, premio di rata, sostituisce_id, e i quattro stati:
  stato_pagamento, perfezionata, rendicontata, copertura_dal / copertura_al.
- **`quote_titoli`** — polizza_id, tipo (prima rata / rata / quietanza /
  appendice), data decorrenza, data scadenza, importo lordo, provvigione,
  stato, mezzo di pagamento, pagatore.
- **`quote_pratica_documenti`** — il documentale *di pratica*: entità
  (polizza / preventivo / cliente / sinistro), id, categoria, nome, url,
  firmato, obbligatorio. Da qui nasce la checklist "cosa manca".

Lavoro necessario:

1. **Migrazione dei dati esistenti**: i 66 preventivi con `polizza_emessa =
   true` diventano righe di `quote_polizze`. La data di scadenza non c'è nello
   storico: va ricavata dove possibile (effetto + durata del prodotto) e
   **chiesta a Francesco** dove non è ricavabile. Non inventarla.
2. **RLS** coerente con le tabelle esistenti (ogni collaboratore vede il suo,
   il responsabile vede la sua rete, il super admin vede tutto). Da copiare
   dalle politiche già attive, non da riprogettare.
3. La pagina *Emissioni* di QUOTO legge dalla nuova tabella invece che dal
   flag sul preventivo.
4. Prove: la polizza si crea dall'emissione, i quattro stati si leggono, la
   migrazione non perde nessun preventivo emesso.

### Punto 2 — Portafoglio e cruscotto a semafori

Lista polizze con filtri (effetto da/a, stato, cliente, prodotto, compagnia,
numero), quattro semafori per riga con spiegazione e legenda, export Excel,
dettaglio a schede (anagrafica, prodotto, dati tecnici, quotazione,
documenti, sinistri). Il dettaglio riusa la struttura a schede già presente
nel riepilogo preventivo.

### Punto 3 — Documentale di pratica e checklist

Per ogni polizza: cosa manca per perfezionarla, distinzione firmato / non
firmato / mancante, caricamento, e le quietanze raggruppate per anno. Il
perfezionamento (§5.1) si accende da qui, calcolato — non messo a mano.

### Punto 4 — Scadenzario e rinnovi

Deriva dal Punto 1. Filtri per mese di scadenza, tacito rinnovo, prodotto; per
riga il preventivo che la sta sostituendo e i ticket collegati; export Excel;
avviso automatico a X giorni. **È il punto che genera più fatturato**: appena
la data di scadenza esiste, questo va fatto subito.

### Punto 5 — Beni del cliente riutilizzabili

`quote_beni` (cliente_id, tipo, etichetta, dati json, fonte, aggiornato_il).
I veicoli si tirano dai preventivi esistenti (`dati` json) invece di
ridigitarli. Nel preventivatore, lo step anagrafica sceglie i beni da elenco.
Riempie `quote_catalogo_veicoli`, oggi vuota.

### Punto 6 — Un solo ticketing

Unire `iam_ticket` (33) e `quote_ticket` (5) in una tabella sola, con: stati
configurabili + codice tecnico, data di schedulazione, collegamento a cliente
/ polizza / preventivo / prodotto, conversazione con allegati, conteggio
mostrato sugli oggetti correlati. Coerente con l'unificazione software: due
code separate sono un doppione da chiudere. **Migrazione attenta: nessun
ticket si perde, i riferimenti restano.**

### Punto 7 — Contabilità di rata

Titoli → comunicazione di incasso (con mezzo di pagamento per riga, pagatore,
totale progressivo) → estratti conto con premi, provvigioni, ritenuta, saldo,
PDF. Il **fido** come vincolo mostrato in tempo reale. Idea forte del portale
osservato: l'**IBAN dedicato** per collaboratore, che rende la riconciliazione
dei bonifici automatica per costruzione. Qui si tocca il denaro: **ogni
formula, aliquota e percentuale va chiesta a Francesco**, mai dedotta.

### Punto 8 — Catalogo prodotti completo e guidato da metadati

Da 8 a tutto il catalogo, con: ramo, esigenza soddisfatta, tariffe,
`tipo_quotazione`, `campi_offerta` (form generata da metadati, non pagine
scritte a mano), documentale di compliance per tariffa, e i requisiti di
abilitazione (formazione, POG) verificati **in fase di quotazione** con il
degradare del §5.4.

### Punto 9 — Sinistri: accendere quello che c'è

`quote_sinistri` è già ben modellata e vuota. Serve solo il flusso minimo:
scelta polizza → data evento, data denuncia, denuncia allegata (obbligatoria),
descrizione → invio. La lavorazione successiva vive nel ticketing (Punto 6).
Il front-end raccoglie, il flusso di lavoro gestisce.

### Punto 10 — Timeline del cliente

La vista cronologica di tutto ciò che riguarda un cliente (preventivi,
polizze, incassi, ticket, sinistri, documenti, comunicazioni), costruita su
`iam_audit` + `quote_log` + le nuove tabelle. È il pezzo che il portale
osservato **non ha** e che vi distingue.

### Punto 11 — Notifiche a eventi, scadenzario incluso

Tipi con contenuto strutturato (§5.10) più gli avvisi di manutenzione delle
compagnie, letti dallo stato degli scraper (`/fonti` esiste già).

### Punto 12 — Interoperabilità

Export nel tracciato **SHARE** dell'interscambio assicurativo italiano
(anagrafiche, polizze, titoli, prodotti). Serve a innestarsi nei gestionali di
agenzia esistenti senza chiedere a nessuno di cambiare strumenti. Da fare
quando i dati sopra esistono: prima è inutile.

---

## 7. Come si scrive una nuova funzione qui dentro

Perché il codice nuovo assomigli a quello che c'è:

- **Italiano** nei nomi, nei commenti e nei messaggi. I commenti spiegano
  *perché*, non *cosa* — e ricordano i bug che hanno insegnato qualcosa.
- **Nessuna emoji nell'interfaccia**: solo icone vettoriali (la scocca ha una
  libreria di 64 simboli; QUOTO usa Tabler).
- **Pagine di QUOTO**: un `<div class="page" id="page-NOME">`, registrato in
  `showPage()`, con l'eventuale funzione di caricamento. La scocca lo apre con
  `?page=NOME`, e la voce di menu va aggiunta in `withus-one.js` (`MEGA` o
  `MENU`) con il titolo e le briciole in `TITOLI_QUOTO`.
- **Permessi**: la scocca non li reinventa, li **rispecchia** dai pulsanti di
  IAM (`data-mirror`). Una nuova voce riservata deve avere il suo pulsante da
  cui ereditare la visibilità.
- **Supabase**: client unico (`db`), tabelle `quote_*` / `iam_*`, RLS sempre
  attiva. Dentro la scocca il preventivatore è **ospite** della sessione:
  `persistSession` e `autoRefreshToken` disattivati (§9.4).
- **Magazzino del browser**: `sessionStorage` e `localStorage` non sono
  garantiti. C'è una rete di sicurezza in testa a `index.html`; non
  aggiungere accessi non protetti.
- **Stampe e PDF**: si generano da JS scrivendo HTML in una finestra nuova. È
  il motivo della regola 7 del §4 — attenzione ai `</body>` dentro le stringhe.

---

## 8. Struttura della navigazione (la scocca è già così)

```
Scrivania
Nuovo preventivo ▾   (mega-menu: Motor · Persona · Casa e patrimonio · Impresa e cauzioni)
Clienti ▾            Anagrafiche · Trattative · Lead · Documenti · Posta
Portafoglio ▾        Polizze · Scadenzario · Titoli e quietanze · Sinistri
Contabilità ▾        Carica documenti · Anomalie · Sospesi · Storico · Conto · Estratto conto
Agenzia ▾            Collaboratori · Agenda · Diario di lavoro · KPI e gare · Produzione · Emissioni · Richieste
Strumenti ▾          Fonti e collegamenti · Lab · Banca dati ANIA · AssiEasy
Ticket
Amministrazione ▾    Utenti e permessi · Azienda · Agenti AI · Esci
```

Le voci **Scadenzario** e **Titoli e quietanze** sono già nel menu ma non
ancora attive (mostrano "in arrivo"): il piano del §6 le accende. Il posto è
già deciso, non va spostato.

---

## 9. Cose già imparate sul campo (non ripeterle)

**9.1 Niente fusioni alla cieca.** `main` e i branch di sviluppo possono
divergere di centinaia di commit. Confrontare sempre il diff dei file prima di
pubblicare: una volta si stava per perdere il ponte `?page=` presente solo su
`main`.

**9.2 I file di collaudo vanno versionati.** La suite di QUOTO era stata
scritta e mai messa in git: quando il container è stato riciclato è sparita ed
è stata riscritta da zero. Ora è nel repo.

**9.3 Non rimuovere il passaggio dei token** (`#at`/`#rt`) finché il dominio
unico non è attivo **e verificato in produzione**: si perde il login.

**9.4 Il riquadro cross-dominio ha due trappole**, entrambe già corrette e
coperte da prove — se ricompare un sintomo simile, guardare qui prima:

- **Il magazzino del browser viene negato.** In un riquadro servito da un
  altro dominio, leggere `sessionStorage` **solleva un errore** (non
  restituisce `null`). Un solo accesso non protetto dentro `onLogin()` fermava
  l'accesso e faceva ricomparire la schermata di login con l'email già
  compilata. Rete di sicurezza: se il magazzino non è utilizzabile se ne
  installa uno in memoria, prima di ogni altro codice.
- **La sessione ruotava.** Il preventivatore rinnovava la sessione per conto
  suo, il refresh token ruotava, IAM restava con quello vecchio → Supabase lo
  marcava `refresh_token_already_used` ("possible abuse attempt") e revocava
  tutto. Dentro la scocca il preventivatore sta **ospite**.

**9.5 I log di Supabase dicono la verità.** Entrambe le trappole sopra sono
state trovate leggendo i log `auth` del progetto, non indovinando. Prima di
ipotizzare, guardare i log e riprodurre.

---

## 10. Priorità, in una riga

**La tabella delle polizze con la data di scadenza** (Punto 1), perché senza
quella non esistono né il portafoglio, né i rinnovi, né la contabilità di
rata — e i rinnovi sono il lavoro che porta più soldi. Tutto il resto viene
dopo, in ordine.
