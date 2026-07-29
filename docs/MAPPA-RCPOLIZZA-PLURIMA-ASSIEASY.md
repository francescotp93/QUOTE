# Mappa al centesimo — RCPolizza · Plurima by Italnext · AssiEasy

> Ricognizione funzionale delle tre piattaforme, fatta da fonti pubbliche in rete, con
> l'obiettivo di **individuare funzioni e processi da replicare in QUOTO e IAM**.
> Rilevazione: luglio 2026.

**Cosa si copia e cosa no.** Qui si mappano *funzioni, flussi di lavoro e modelli di dato* —
cioè idee di prodotto, che non sono protette. Non si copiano testi, grafica, codice, listini
di tariffa o condizioni di polizza delle tre piattaforme: quelli vanno riscritti/negoziati da noi.
I riferimenti normativi citati (RUI, art. 119-ter CAP, art. 22 DL 179/2012, IVASS 40/2018) sono
vincoli che valgono anche per noi, non dettagli estetici da imitare.

---

## 0. Fonti

| Piattaforma | URL rilevati | Livello di dettaglio ottenuto |
|---|---|---|
| RCPolizza | `rcpolizza.it` (223 URL interni), `rcpolizza.it/preventivo/**/step-N`, `procedura-acquisto-clienti`, `crm.rcpolizza.it` | **Molto alto** — nomi esatti dei campi form, tassonomia prodotti, processo d'acquisto integrale |
| Plurima by Italnext | `plurima.net` (home + FAQ inline), `portale.plurima.net/registrazione.php` | **Alto sul perimetro pubblico** — onboarding con campi esatti, FAQ operative; il portale interno è dietro login |
| AssiEasy (SAVE Srl) | `assieasy.com`, `assieasy.com/area_download/manuali/` (28 manuali PDF pubblici, scaricati ed estratti) | **Molto alto** — menu a 3 livelli, widget, convenzioni UI, processi contabili e provvigionali |

Nota: l'area download di AssiEasy è una directory listing aperta. I 22 documenti scaricati
(manuali + changelog unico da 155k caratteri) sono la fonte primaria della sezione 4.

---

## 1. Quadro comparativo — chi fa cosa

| | RCPolizza | Plurima by Italnext | AssiEasy |
|---|---|---|---|
| **Cosa è** | Broker digitale B2C/B2B: comparatore + emissione online | Piattaforma wholesale B2B2B per intermediari (collaborazione ex art. 22) | Gestionale web per agenzie, plurimandatari e broker |
| **Chi paga** | Cliente finale (premio) | Intermediario (nessun costo d'iscrizione; guadagna a provvigione) | Agenzia (canone software) |
| **Chi è l'utente** | Assicurato / azienda | Agente, broker, subagente | Agente, impiegato, filiale, produttore |
| **Soggetto** | RCPolizza.it — RUI B000488439 (26/11/2014) | Italnext srl — RUI A000531290, Reale Group | SAVE Srl (Tortona, AL) |
| **Il nostro analogo** | **QUOTO** lato front di quotazione | **QUOTO** lato rete/collaboratori | **IAM** |

**Dove ci collochiamo.** QUOTO oggi ha ~45 pagine-prodotto (`page-rcprof`, `page-rca`, `page-casa`,
`page-cauzioni`, `page-infortuni`, `page-malattia`, `page-vita`, …) più `page-emissioni`,
`page-estratto`, `page-documenti`, `page-sinistri`, `page-ticket`, `page-anagrafiche`,
`page-reti`, `page-providers`. Cioè: siamo già strutturalmente **un ibrido RCPolizza + Plurima**.
IAM (dashboard, agenti, utenti, performance, pipeline, conto, sospesi, workdiary, lab) è il
nostro **AssiEasy**, ma molto più leggero sul lato portafoglio/contabilità.

---

## 2. RCPolizza — mappa funzionale

### 2.1 Tassonomia prodotti e schema URL

Gerarchia a 4 livelli, esposta sia in URL sia nei campi hidden del form:

```
ramo  →  gruppo  →  professione  →  sottoprofessione
id_ramo  id_gruppo  id_professione  id_sottoprofessione
```

Schema URL del preventivatore:

```
/preventivo/<ramo>/step-1
/preventivo/<ramo>/<prodotto>/step-1
/preventivo/<ramo>/<prodotto>/<sotto-prodotto>
```

**Catalogo completo dei flussi di preventivo attivi** (rilevati come URL `/preventivo/`):

| Ramo | Prodotti con flusso dedicato |
|---|---|
| `rc-professionale` | flusso unico + `intermediario-assicurativo-sez-e` |
| `rct-rco` | `rct-impresa-generica`, `rct-impresa-edile`, `rct-rco-enti-pubblici`, `rct-rco-assiciazioni-no-profit`, `rc-prodotto`, `rc-inquinamento`, `droni`, `colpa-grave-autisti-art-30-ccnl-trasporti` |
| `rca` | `rca-autovettura`, `rca-libro-matricola` |
| `cvt-auto` | flusso base + `incendio-furto-cristalli-auto` |
| `rischio-incendio` | `incendio-impresa`, `incendio-commercio`, `incendio-industriale`, `incendio-agricolo` |
| `rischio-furto` | `furto-impresa`, `furto-commercio`, `furto-industriale`, `furto-agricolo` |
| `multirischi-impresa` | `multirischi-impresa`, `multirischi-azienda-agricola` |
| `multirischi-commercio` | `multirischi-commercio` |
| `multirischi-energie-rinnovabili` | flusso unico |
| `tutela-legale` | `tl-dirigenti-amministratori-privati` |
| `cauzioni` | flusso unico |
| `ear` | `erection-all-risk` |
| `rc-vettore-stradale` | `rc-vettore-stradale-dpc` |
| `perdite-pecuniarie` | `ritiro-patente-dipendenti-aziende-trasporti` |
| `rc-famiglia`, `rc-natanti`, `grandine`, `malattia`, `viaggi`, `vita`, `assistenza-stradale-veicoli` | flusso unico |

**Tassonomia commerciale (landing SEO)** — ~200 pagine, organizzate in:
`assicurazione-professionale`, `assicurazione-area-aziende`, `assicurazione-errors-omissions/*`
(consulente marketing, fotografo, graphic design, interior design, interprete, wedding planner,
tatuatore, istruttore yoga, guida turistica, estetista, …),
`assicurazione-rc-professionale-medico/*` (allergologo, anestesia, endocrinologo, medicina
estetica, medico legale, oculista, ortopedico, …),
`assicurazione-rc-parasanitario-sanitario-non-medico/*` (infermiere, fisioterapista, psicologo,
osteopata, OSS, ostetrica, odontotecnico, nutrizionista, personal trainer, …),
`assicurazione-dipendenti-*` (comune, regione, provincia, ASL, ministero, scuole/università,
camera di commercio, forze dell'ordine, consorzi),
più prodotti verticali: `polizza-postuma-decennale`, `polizza-car-rischi-di-costruzione`,
`polizza-asseverazione-ecobonus-sismabonus-100`, `polizza-certificazioni-transizione-5-0`,
`polizza-rischi-catastrofali-imprese`, `polizza-terremoto-alluvioni`, `polizza-donazione-sicura`,
`polizza-successione-immobiliare`, `polizza-visto-leggero`, `polizza-progettista-merloni`,
`polizza-verificatore-di-progetto`, `polizza-validatore-progetto`, `polizza-tutela-affitto`,
`polizza-leasing-beni-strumentali`, `polizza-incendio-scoppio-mutuo`,
`polizza-singolo-intervento-chirurgico`, `assicurazione-cyber-risk`, `assicurazione-condominio`,
`piani-di-welfare-aziendale`.

**Il gruppo "Professioni" del preventivatore RC Prof** contiene 9 gruppi e ~80 tipologie:
Agenti e Commercianti · Autotrasportatori · Dentisti/Odontoiatri/Igienisti · Personale
Parasanitario/Sanitario non medico · Personale Sanitario · **Personale sanitario — polizze stand
alone (singolo rischio)** · **Polizze Complementari e di Secondo Rischio** · Professioni
Economico/Giuridiche · Professioni Tecniche.
Fra le tipologie: distinzione fine per *studio singolo vs. associato* (avvocato ≤10 / >10
professionisti, geometra, perito industriale, studio medico/dentistico/veterinario associato),
per *tipo di atto medico* (atti invasivi con o senza interventi chirurgici / no atti invasivi),
per *rapporto di lavoro* (dipendente medico/non medico di azienda sanitaria pubblica, privata,
privata convenzionata SSN — solo colpa grave), e prodotti-strumento (**Polizza in eccesso** che
estende il massimale della sottostante).

> **Da copiare in QUOTO.** La nostra `page-rcprof` ha già `rcprof_tariffe.json` e
> `tariffe/rc_professionale_v2.json`. Manca la **gerarchia a 4 livelli con ID stabili** e la
> distinzione singolo/associato/dipendente/eccesso come *dimensioni* del prodotto anziché come
> prodotti separati. È la differenza tra 80 voci a mano e una tassonomia interrogabile.

### 2.2 Motore di preventivo — campi esatti

Ogni step posta lo stesso set di campi di stato:

| Campo hidden | Funzione |
|---|---|
| `form_step` | step corrente del wizard |
| `id_ramo`, `id_gruppo`, `id_professione`, `id_sottoprofessione` | coordinate del prodotto |
| `session_token` | sessione di preventivo **anonima**, prima di qualunque anagrafica |
| `req_fields` | **regole di validazione condizionale serializzate** (base64 di una stringa esadecimale offuscata) generate lato server e rimandate al client |
| `cp_batch_only` | flag di quotazione batch (richiesta massiva a più compagnie) |

**Blocco "questionario assuntivo" standard** — identico su RCT/RCO, multirischi, RC prof:

| Campo | Tipo | Note |
|---|---|---|
| `descrizione_rischio` | textarea | descrizione libera dell'attività |
| `precedente_polizza` | select | «Hai mai stipulato una polizza a copertura del rischio?» |
| `compagnia_precente` + `compagnia_precente_altro` | select + text | elenco compagnie con voce libera |
| `data_ultima_scadenza` | data GG/MM/AAAA | |
| `massimale_precedente` + `massimale_precedente_altro` | select + text | facoltativo |
| `is_retroattivita_ereditata` | flag | **retroattività ereditata dalla polizza precedente** — determina il prezzo |
| `sinistri_pregressi` + `motivo_sinistri_pregressi` + `data_ultimo_sinistro` | select + textarea + data | |
| `fatti_circostanze` + `motivo_fatti_circostanze` | select + textarea | «segnalazioni di errori/omissioni che possono dar luogo a richiesta di risarcimento» |
| `coperture_rifiutate` + `motivo_coperture_rifiutate` | select + textarea | «coperture rifiutate o non rinnovate dagli assicuratori» |

**Domande dinamiche di coerenza prodotto**: `domande_modelli[239]`, `[240]`, `[241]` su RCT
impresa; `[242]`, `[243]`, `[244]` su multirischi impresa. Sono domande a ID, caricate dal
"modello" di prodotto, con testo tipo *«Desidera assicurare i danni a terzi che lei o la sua
azienda potrebbero causare?»*, *«È un imprenditore e/o un'azienda?»*, *«Desidera tutelare lei o
la sua azienda da eventuali perdite patrimoniali?»*. Servono a verificare che il prodotto scelto
sia **coerente col bisogno** (adeguatezza IDD) *prima* di mostrare il prezzo.

**Blocco contatti + consensi** (identico ovunque):
`email`, `telefono`, `privacy_rcpolizza` (obbligatorio), consenso marketing proprio,
`privacy_terzi` (marketing di terzi, esplicitamente non obbligatorio).
In più `f2_telefono` — widget flottante *«Lascia qui il tuo numero, sarai richiamato»*.

**Blocco RCA-specifico** (`/preventivo/rca/rca-autovettura`):
`tipo_veicolo`, `proponente_contraente` (persona fisica/giuridica), `data_nascita`,
`piva_contraente`, `targa`, `gia_assicurato`, `bersani`, `rc_familiare`,
`targa_bersani` + `appartenenza_targa_bersani` + `data_nascita_bersani`,
`targa_familiare` + `appartenenza_targa_familiare` + `data_nascita_familiare`.
Cioè: **ereditarietà classe di merito modellata come sotto-form condizionale**, con due percorsi
distinti (Bersani vs RC familiare) e verifica dell'intestatario della targa di origine.

### 2.3 Pagina proposte

Tre schede sopra la lista risultati:

1. **Filtri Proposte**
2. **Dati iniziali** — permette di tornare sui dati inseriti senza perdere la sessione
3. **Garanzie Aggiuntive** — il cliente aggiunge/toglie garanzie e il premio si ricalcola

Schermata di attesa esplicita («Stiamo elaborando le migliori proposte…», «Non chiudere la
pagina») — cioè quotazione **asincrona** verso più compagnie, non un calcolo istantaneo.

Disclaimer ricorrente: *«Le proposte verranno confermate da un operatore previa visione del
questionario assuntivo compilato e sottoscritto»* e *«l'intermediario non fornisce consulenza
personalizzata ai sensi dell'art. 119-ter CAP»*.

### 2.4 Processo d'acquisto end-to-end

Dalla pagina `procedura-acquisto-clienti`, 11 fasi:

1. Il cliente individua la polizza in catalogo
2. Compila il form iniziale (massimale, fatturato, esigenze, coperture in essere; contatti facoltativi)
3. Vede le proposte calcolate; può selezionare garanzie aggiuntive e modificare le coperture
4. Sceglie l'offerta **o richiede una quotazione personalizzata**
5. Inserisce i dati anagrafici
6. Accetta consensi obbligatori: termini, **Allegati 3 e 4** (informativa precontrattuale IVASS), **mandato di brokeraggio**, trattamento dati
7. Riceve **email #1** con username/password dell'area clienti — cambio password obbligatorio al primo accesso
8. Riceve **email #2** con questionario pre-assuntivo, mandato privacy, fascicolo informativo
9. Compila il questionario assuntivo (variazioni ⇒ modifica del premio rispetto alla quotazione iniziale); verifica i dati anagrafici
10. **Firma**: mandato privacy con **OTP**; questionario firmato a mano + documento d'identità via email
11. Riceve la proposta nominativa con modalità di pagamento (**bonifico o carta**), paga, riceve la polizza, la stampa/firma e verifica la conformità alla proposta

> **Da copiare in QUOTO.** Noi abbiamo `firma.html`, `server/sign.js`, `server/pay.js`,
> `server/firmaCollab.js`: i pezzi ci sono. Manca la **catena di stato esplicita** del preventivo
> (`preventivo → proposta → questionario → firma → incasso → emissione → polizza`) con email
> transazionali agganciate a ogni transizione e un'area cliente creata automaticamente al passo 7.

### 2.5 Aree riservate e supporto

- **Area Clienti** (`accesso-area-personale`) — documenti, polizze, stato pratica
- **Area Agenti** (`crm.rcpolizza.it`) — CRM su sottodominio dedicato
- `sinistri` — apertura sinistro
- `supporto-assistenza`, chat con consulente, **consulente personale assegnato**
- `reclami`, `tutela-cliente`, `whistleblowing`, `elenco-rapporti-intermediazione`, link diretto alla scheda RUI su `servizi.ivass.it`

### 2.6 Contenuti che generano fiducia (e traffico)

Funzioni "gratuite" che valgono come acquisizione, tutte replicabili a costo quasi zero:

- **`rating-compagnie`** — rating delle compagnie collocate
- **`quote-mercato`** — quote di mercato per compagnia
- **`glossario-assicurativo`**
- **`normativa-assicurativa`**
- **`notizie`** + `feeds` — es. «Esame IVASS 2026», «Legge 01/2026 responsabilità dipendenti pubblici», «Targa monopattino»
- `dove-siamo`, recensioni Trustpilot in home

> **Da copiare in QUOTO.** `rating-compagnie` e `quote-mercato` sono il modo più economico per
> giustificare *perché* proponiamo una compagnia invece di un'altra — e sono anche un pezzo di
> compliance sull'adeguatezza, non solo marketing.

---

## 3. Plurima by Italnext — mappa funzionale

Modello: **intermediario wholesale**. Non vende al cliente finale; mette a disposizione di agenti
e broker un catalogo multi-compagnia in regime di collaborazione fra intermediari.
Italnext srl è controllata da Italiana Assicurazioni (Reale Group), che nel giugno 2023 ha
acquisito la maggioranza di Plurima Servizi Assicurativi.

### 3.1 Onboarding — il pezzo più interessante

`portale.plurima.net/registrazione.php` — **registrazione gated dal RUI**, campi esatti:

**Step 1 — verifica intermediario**
| Campo | Note |
|---|---|
| `cf_registrazione` | codice fiscale — obbligatorio |
| `rui_registrazione` | **numero iscrizione RUI — obbligatorio** |
| `data_registrazione` | data iscrizione al RUI |
| `condizioni_1` | checkbox condizioni |

**Step 2 — indirizzo normalizzato**
Campi `Indirizzo / Numero civico / Provincia / Comune / CAP` con un passaggio di
**certificazione dell'indirizzo**: se non riconosciuto compare *«Attenzione: indirizzo non
certificato! Inserire indirizzo corretto»* e una conferma esplicita
*«Confermare il seguente indirizzo?»*.

**Step 3 — utente**
`rui_registrazione_2`, `data_iscrizione_rui`, `cf_registrazione_2`, `nome`, `cognome`,
`data_nascita`, `luogo_nascita`, `qualifica`, `sesso`, `username`, `password` (+ ripeti),
`email`, `cellulare`, e per le società `Company Name` / `Company URL` / `Short Description`.

Poi: **firma online dell'accordo di collaborazione** direttamente dal proprio profilo
(«bastano 3 minuti» per registrarsi e vedere catalogo e preventivatore; si emette solo dopo la firma).
Iscrizione gratuita, **nessuna penale di uscita**, nessun minimo di produzione.

> **Da copiare in QUOTO/IAM.** Oggi l'ingresso di un collaboratore in QUOTO passa da IAM
> (`iam_utenti`, `accesso_quoto`). Manca: (a) validazione RUI in fase di invito, (b) normalizzazione
> dell'indirizzo con conferma esplicita, (c) **accordo di collaborazione firmato in piattaforma
> come gate all'emissione** — che è esattamente quello che l'art. 22 richiede di poter dimostrare.
> Il pattern "ti registri e vedi il catalogo / firmi e puoi emettere" è la conversione migliore
> vista fra le tre piattaforme.

### 3.2 Quotazione ed emissione

- **Un unico questionario valutativo** → preventivi da più compagnie in un colpo solo, confronto affiancato
- **Preventivi "QUICK"** — sottoinsieme di prodotti a emissione rapida e **totalmente autonoma**
- Prodotti fuori catalogo: **apertura ticket** per richiesta di quotazione al team assuntivo
- Emissione autonoma su gamma ampia, assistita sui rischi particolari
- Generazione automatica di tutta la documentazione contrattuale
- **Firma elettronica avanzata (FEA)** inclusa

### 3.3 Amministrazione e provvigioni

- **Dashboard portafoglio** sempre disponibile
- **IBAN virtuale gratuito** per l'intermediario — incassi tracciati e riconciliati per conto
- Controllo saldo provvigioni in tempo reale
- **Chiusura estratto conto on demand**: non si aspetta fine mese; l'intermediario chiude quando vuole e riceve il bonifico
- Storico delle provvigioni già incassate

> **Da copiare in QUOTO.** Abbiamo `page-estratto` e `page-conto` (IAM). Il salto è
> **la chiusura estratto conto self-service con pagamento a seguire** e **l'IBAN virtuale per
> collaboratore** — che risolve da solo metà dei problemi di riconciliazione incassi.

### 3.4 Sinistri, rete, supporto

- **Sinistri**: sezione dedicata, caricamento documentazione, **ticket generato automaticamente** e presa in carico
- **Multiutenza**: agenti e broker creano sottoutenze per collaboratori/subagenti, ciascuna con un **livello di autonomia** impostato dal profilo principale
- Accesso desktop / mobile / tablet, tutto in cloud
- Customer care 24/24, consulente dedicato, video tutorial, **demo prenotabile**

---

## 4. AssiEasy — mappa funzionale (il nostro riferimento per IAM)

Gestionale web di SAVE Srl. Nel materiale ufficiale: 770 intermediari (365 agenzie
monomandatarie, 370 plurimandatari, 35 broker) — il sito oggi dichiara oltre 1000 agenzie.
Installabile su server d'agenzia **o** in hosting cloud (~400 €/anno), con WebApp mobile.

### 4.1 Menu a 3 livelli — mappa completa

**1 · Polizze e Assicurati**
- *Anagrafica*: Anagrafica · Completezza dati anagrafici · Scadenzario Concorrenza/Preventivi · Scadenzario privacy · Anagrafiche acquisite e perse nel periodo · Compleanni clienti
- *Polizze*: Inserimento/Emissione polizze · Inserimento Contratti (non assicurativi) · Polizze e relazioni / Contratti e relazioni · Polizze Annullate · Polizze perse anni precedenti · Scadenzario Sospensioni · Scadenzario Cessioni · Scadenzario Regolazioni · Scadenzario Fidi cauzioni · Senza tacito rinnovo
- *Titoli*: Verifica abbinamento titoli
- *Quietanzamento*: Giacenze / Scadenze Imminenti · Genera Quietanze · Carico del Periodo · Titoli al contenzioso · **Difesa proattiva portafoglio**
- *Incassi*: Visione Foglio Cassa · Incassato collaboratori · Incassato per garanzia · Controllo documenti su incasso
- *Sinistri*: ricerca/consultazione · inserimento manuale · Sinistri movimentati nel periodo · **Comunicazioni sinistri prescrizione**
- *Controllo Congruità*: Polizze da verificare · Polizze vive senza incassi · Pulitura arretrati

**2 · Analisi**
- *Commerciali*: Analisi clientela · Check-up portafoglio · Analisi incassi (+ riepilogo per mese) · Polizze nuove e annullate nel periodo · **Retention** · Portafoglio auto per classi di merito · **Analisi ATR** · Check-up di agenzia
- *CRM*: **Analisi Fabbisogni** · Auto senza tutela/infortuni/altro · **Calcolo rating massivo** · Inserimento Riforme/Azioni Mkt · Analisi libere · Ricerca rischi in prodotto · Valutazioni su incassato
- *Organizzazione*: Dati interessanti stesura studio di settore · Portafoglio per localizzazione geografica

**3 · Collaboratori**
- *Produttori*: Gestione produttori/sub-produttori · profilazione · **Estratto conto produttori / collaboratori** · Gruppi produttore · Collaborazioni · Filiali · Riassegnazione portafoglio produttore · Capitolati collaboratori

**4 · Contabilità di agenzia**
- Appunti incasso · **Quadratura** · **Sospesi** (scadenzario, recupero, mai cancellati) · Registrazione movimenti / prima nota per causali · Anticipazioni · Riconciliazione bancaria · Fatturazione elettronica · Titoli / gestione fatture e commissioni · Estratti conto collaborazioni-compagnie · Flusso incassi broker↔agenzia · Export prima nota verso 11-18 gestionali contabili (Buffetti, Fiscage, GIS, Magix, IPSOA, Osra, Pass Coge, SMC, Sistemi Profis, TeamSystem, Zucchetti Ago/Omnia)

**5 · Varie**
- *Amministrazione*: Utenti · Parametri Email (SMTP + test) · Parametri SMS · **Parametri Home Insurance** · Gestione modelli lettere (con duplica template) · **Privacy gestione consensi** · Gestione richieste di firma · Cartelle flussi
- *Importazioni*: Anagrafiche · Polizze/Titoli · Agenda · immagini e file ottici
- *Esportazioni*: Vendita massiva (con flag «escludi clienti senza privacy»)
- *Tabelle nodi*: Agenzie · Compagnie (+ «Genera tabelle») · Rami (duplica rami e prodotti) · Prodotti · Sottotipi carico
- *Utility*: Area Download · Gestione Documenti · Gestione richieste di firma · Normalizzazione cognomi · **Registro telefonate**

**6 · Sistema** — Accessi/Utenti · Tabelle di sistema · **Nodi Agenzie** · profilature
**7 · Vai a…** — info, cambio password

### 4.2 Home page — widget

Cinque zone: *Informazioni utente* (utente, ora di login, Esci) · *Menu orizzontale a 3 livelli* ·
*Menu statico verticale* collassabile · *Toolbar sempre presente* · *Widget*.

Widget rilevati:
- **Da evadere oggi (n)** — agende in scadenza oggi
- **Agende ricevute da colleghi (n)** — con flag "letto" per togliere l'evidenza
- **Agende inviate ai colleghi** — non ancora evase
- **Attività di oggi / Attività scadute**
- **Preventivi in scadenza** e **Preventivi anni precedenti** (riproposizione commerciale)
- **Polizza concorrenza primo anno** e **anni precedenti**
- **(n) scadenze mora** — polizze che escono di mora nei prossimi 3 giorni
- **Situazione richieste preventivi** (responsabile) e **Preventivi assegnati personali** (backoffice)

### 4.3 Convenzioni UI riusabili

**Toolbar** (persistente in ogni programma): 4 icone di *cruscotto cliente* (singolo assicurato /
famiglia / azienda / gruppo libero) · Appunti personali · Agenda · Esci (= tasto ESC) · Attività ·
Archiviazione ottica · Corsi · desktop remoto per l'assistenza.

**Griglia dati** — è di fatto una specifica di componente:
ordinamento per colonna · filtri per contenuto (**intestazione in grassetto sottolineato quando
un filtro è attivo**) · scelta colonne visibili · editing in cella (icona matita
nell'intestazione) · spostamento colonne in drag · **menu contestuale col tasto destro** con le
azioni disponibili sul record.

**Bottoni sopra la griglia**: `CSV` · `WORD/DOC/LETTERA` · **`CONTATTA`** (apre l'invio
lettera/mail/SMS *sul risultato dell'estrazione*) · `NUOVO`.
**Bottoni di procedura**: Cerca (= Invio) · Salva (autosalvataggio al cambio cartella) · Elimina ·
Modifica · Aggiungi a…
**Campi**: data senza barre né secolo (basta il giorno se siamo nel mese) · campi tabella con **F2**
per vedere e — se amministratore — inserire nuove voci al volo.
**Cartelle di lavoro** (tab) per raggruppare set di dati omogenei nelle schermate dense.

> **Da copiare in IAM.** Il pattern **estrazione → CONTATTA** (qualunque lista diventa una
> campagna mail/SMS/lettera in un click) e il **cruscotto cliente a 4 livelli**
> (persona / famiglia / azienda / gruppo libero) sono le due idee più forti dell'intero gestionale.
> La griglia con filtro-evidenziato e F2 sui tabellari è una specifica di componente già pronta.

### 4.4 Processi chiave

**Alimentazione dati.** Caricamento automatico dei flussi di ~31 compagnie (Allianz, AXA,
Cattolica, Groupama, HDI, Helvetia, Italiana, ITAS/RSA, Nobis, TUA, UnipolSai, Uniqa, Zurich, …);
per le compagnie senza flusso (Reale, Sara, Vittoria) import da file prodotti dai gestionali di
compagnia; se una compagnia rilascia dati ma il modulo non esiste, **SAVE lo realizza gratis**.
Gestione scarti documentale di compagnia.

**Controllo congruità.** Verifica sistematica che polizze / titoli / incassi siano coerenti fra
loro e con la realtà: polizze da verificare, polizze vive senza incassi, pulitura arretrati.
È il presupposto di ogni analisi: senza questo, i numeri commerciali mentono.

**Difesa proattiva del portafoglio.** Sui contratti in scadenza mette in evidenza: note registrate
sulla polizza, **aumento/diminuzione del premio rispetto all'incasso precedente**, azioni marketing
in corso, anzianità del contratto, presenza di regolazione premio, e **le divergenze fra le
giacenze arrivate dalle compagnie e le nostre**. Per ogni contratto si decreta l'azione da fare.

**Quietanzamento.** Giacenze e scadenze imminenti (widget mora a 3 giorni), generazione quietanze
per le polizze inserite a mano, carico del periodo per produttore, titoli al contenzioso,
interrogazione **SIC** diretta per chi ha le credenziali, stampa carico in Excel.

**Provvigioni collaboratori.** Tre modalità di calcolo:
(a) **retrocessione** sulle provvigioni di agenzia, (b) **percentuale sul premio**,
(c) **aliquota sull'imponibile di polizza** — e per i rami auto anche **sull'imponibile della
singola garanzia**. Applicabili storicamente e in modo differenziato per ramo, prodotto e garanzia,
distinguendo **nuovo contratto (acquisto)** / **altre rate (incasso)** / **quota diritti**.
Estratto conto per collaboratore o per **gruppo collaboratore** (che riunisce i diversi codici di
compagnia sotto l'effettivo produttore). Gestione provvigioni **di II livello**.

**Contabilità assicurativa.** Appunti incasso (si registra la modalità di pagamento **anche prima
che polizza e titolo esistano** in portafoglio) → quadratura → posizione finanziaria ed economica
+ estratto conto dei conti → individuazione squadrature. **Sospesi**: anticipazioni di denaro ai
clienti, parametrizzate dal piano dei conti, che generano uno scadenzario; il sospeso recuperato
**non viene cancellato** e resta consultabile nel tempo. Prima nota generata automaticamente dalle
operazioni assicurative; contabilità fiscale esplicitamente fuori perimetro.

**Precontrattuale e firma.** Generazione automatica dei documenti precontrattuali cliente,
gestione richieste di firma, **firma digitale OTP**, fatturazione elettronica via partner.

**Privacy.** Gestione consensi con scadenzario, ricerca dei consensi mancanti o scaduti, flag
«escludi clienti senza privacy» nelle esportazioni massive. La privacy è un *dato di portafoglio*,
non un adempimento a parte.

**Richieste preventivi** (manuale dedicato) — flusso di lavoro completo:
- **Macro aree** configurabili (default Auto / Rami Elementari / Vita) per smistare le pratiche a backoffice diversi
- Tabella **Stati** personalizzabile: richiesta di preventivo → richiesta quotazione da compagnia → attesa documentazione dal cliente → … → chiusura positiva/negativa
- Il collaboratore inserisce la richiesta sulla macro area; il backoffice vede le **non assegnate** nel proprio widget e le prende in carico; lo stato guida il monitoraggio, agganciato ad agenda e documenti; alla chiusura la pratica sparisce dai widget
- Due widget distinti: **totale** (responsabile) e **personale** (backoffice), entrambi con tasto "aggiungi pratica" e conteggio per stato

**Caricamento polizze con IA** (manuale dedicato) — il pezzo più moderno:
- Si crea un **modello per ogni combinazione compagnia × layout** (es. «Compagnia Blu Rami elementari» e «Compagnia Blu Auto»)
- Il modello contiene: PDF di esempio · **quali pagine** l'IA deve leggere (max 4) · **quali campi** estrarre · note operative · flag attivo
- **Auto-riconoscimento del mandato**: si indicano fino a 3 stringhe (`Testo1/2/3`, che devono comparire nel PDF **in quell'ordine**) → AssiEasy deduce compagnia/collaborazione
- **Auto-riconoscimento ramo/prodotto** con lo stesso meccanismo a 3 stringhe
- Correzione per campo con istruzioni in linguaggio naturale (es. *«leggi il campo premio prima rata, leggi totale lordo rata»*)
- Campi estratti: P.IVA, CF, nominativo, cognome, nome, comune, indirizzo, CAP, provincia, numero polizza, effetto, scadenza, inizio/scadenza copertura, frazionamento, n. sostituita, targa, modello auto, immatricolazione, settore, uso, alimentazione, valore, classe di merito universale e di compagnia, e **la matrice premi completa** (imponibile / netto CVT / netto RCA / diritti / SSN / accessori / imposte / lordo) × **tre orizzonti (firma / annuo / rata)**
- Regole pratiche: se CVT e RCA sono espliciti nel PDF si leggono quelli e si toglie l'imponibile, altrimenti si legge l'imponibile e **il sistema calcola i totali**; si legge o l'annuo o la rata (mai entrambi) e il sistema deriva l'altro dal frazionamento; i premi alla firma vanno sempre letti
- Limite dichiarato: sull'auto si ricava il totale RCA e il totale CVT, **non** l'imponibile della singola garanzia

**Home Insurance** — portale del cliente finale, configurato da `Varie → Amministrazione →
Parametri Home Insurance`: livello di accesso (solo polizze / + scadenze / + sinistri), definibile
anche **per singolo utente**; anagrafica in footer; link a cookie policy, privacy, logo, logo menu,
immagine pubblicitaria, procedura reclami; **RUI pubblicato sul sito**; social; sottotitolo;
stile (vuoto/blu); titolo; **anzianità massima e minima in giorni per mostrare le scadenze** (se
negativa è una scadenza futura). Creazione utente dall'anagrafica con tasto «Crea utente home
insurance» (username precompilato dall'email, password casuale, stato attivo/disabilitato) e mail
di benvenuto da template duplicabile, con account SMTP dedicato e mail di prova.

**Profilazione utenti.** Tre profili base: **Utente Agenzia** (vede tutto, ma può essere limitato a
uno o più codici agenzia), **Utente Filiale**, **Utente Produttore** (subagente/sub-produttore),
aggregabili per **Gruppo Produttore**. Accessi illimitati e personalizzati, menu differenziati per
ruolo. Limitazione della visione dei dati al singolo utente. Passaggio di porzioni di portafoglio
fra clienti AssiEasy per codice produttore.

**Integrazioni**: centralino VoIP (riconoscimento chiamante → apertura automatica del cruscotto
anagrafico) + **Registro telefonate** con note operative · SMS · Posta Pronta/Aimon per la posta
cartacea inviata dalla scrivania · digitalizzazione documenti (GSV) · scanner OCR che archivia
automaticamente leggendo il numero di polizza o il nominativo · WhatsApp massivi dalla WebApp.

**Archiviazione ottica.** Documenti abbinati ad anagrafiche, polizze, incassi, sinistri, polizze
concorrenza e documenti contabili. Flag **«Documenti condivisi»** per mettere condizioni di
polizza, circolari e documenti interni a disposizione della rete. Verifica di quali polizze non
hanno il documento allegato. **Il libretto auto inserito una volta si ritrova su tutte le polizze
con la stessa targa.**

---

## 5. Sintesi operativa — cosa portiamo dentro, dove, con che priorità

| # | Funzione da replicare | Fonte | Va in | Gap oggi | Priorità |
|---|---|---|---|---|---|
| 1 | Tassonomia prodotti a 4 livelli con ID stabili (`ramo/gruppo/professione/sottoprofessione`) | RCPolizza | QUOTO | tariffe in JSON piatti | **Alta** |
| 2 | Questionario assuntivo standard riusabile (precedente polizza, retroattività ereditata, sinistri pregressi, fatti e circostanze, coperture rifiutate) | RCPolizza | QUOTO | per-prodotto, non condiviso | **Alta** |
| 3 | Domande dinamiche di coerenza/adeguatezza per modello prodotto (`domande_modelli[]`) | RCPolizza | QUOTO | assente | **Alta** |
| 4 | Sessione di preventivo anonima (`session_token`) recuperabile prima dell'anagrafica | RCPolizza | QUOTO | assente | **Alta** |
| 5 | Catena di stato preventivo → proposta → questionario → firma → incasso → emissione, con email a ogni transizione | RCPolizza | QUOTO | parziale (`page-emissioni`) | **Alta** |
| 6 | Accordo di collaborazione firmato in piattaforma come **gate all'emissione** + validazione RUI in registrazione | Plurima | QUOTO + IAM | assente | **Alta** |
| 7 | Chiusura estratto conto **on demand** + pagamento provvigioni a seguire | Plurima | QUOTO/IAM | `page-estratto`, `conto` sono di sola lettura | **Alta** |
| 8 | Motore provvigionale a 3 modalità (retrocessione / % premio / aliquota su imponibile, anche per garanzia), differenziato acquisto vs incasso vs diritti | AssiEasy | IAM | assente | **Alta** |
| 9 | Widget home azionabili (scadenze mora 3gg, preventivi in scadenza, preventivi anni precedenti, agende ricevute/inviate) | AssiEasy | IAM | dashboard informativa | **Alta** |
| 10 | Flusso "Richieste preventivi" con macro-aree, stati personalizzabili, presa in carico backoffice, doppio widget | AssiEasy | IAM (`page-richieste`) | esiste la pagina, manca il workflow | **Alta** |
| 11 | Estrazione → **CONTATTA** (qualunque lista diventa campagna mail/SMS/WhatsApp) | AssiEasy | IAM | assente | **Media** |
| 12 | Cruscotto cliente a 4 livelli (persona / famiglia / azienda / gruppo libero) | AssiEasy | IAM | anagrafica singola | **Media** |
| 13 | Controllo congruità dati (polizze vive senza incassi, pulitura arretrati) | AssiEasy | IAM (`page-anomalie`) | parziale | **Media** |
| 14 | Difesa proattiva portafoglio (delta premio vs incasso precedente, divergenze giacenze, azione da decretare) | AssiEasy | IAM | assente | **Media** |
| 15 | Caricamento polizze da PDF con IA a modelli (pagine + campi + auto-riconoscimento mandato e ramo su 3 stringhe ordinate) | AssiEasy | QUOTO + IAM | assente (abbiamo `scraper/`) | **Media** |
| 16 | Consensi privacy come dato di portafoglio: scadenzario, consensi mancanti/scaduti, flag di esclusione nelle esportazioni | AssiEasy | IAM | parziale | **Media** |
| 17 | Portale cliente finale configurabile (livelli di accesso, finestra scadenze, RUI in footer, mail di benvenuto da template) | AssiEasy + RCPolizza | QUOTO | assente | **Media** |
| 18 | Sotto-utenze collaboratori con **livello di autonomia** impostato dal profilo padre | Plurima | IAM | ruoli fissi (top_master/master/operativo) | **Media** |
| 19 | Sinistri con ticket generato automaticamente all'upload documenti | Plurima | QUOTO (`page-sinistri`+`page-ticket`) | pagine separate | **Media** |
| 20 | Prodotti "QUICK" a emissione autonoma vs. prodotti che richiedono assunzione | Plurima | QUOTO | non esplicitato | **Media** |
| 21 | Pagine di fiducia: rating compagnie, quote di mercato, glossario, normativa, notizie | RCPolizza | QUOTO (pubblico) | assente | **Bassa** |
| 22 | Griglia dati standard (ordina/filtra/colonne/edit-in-cella/drag/menu destro/CSV/Word) | AssiEasy | IAM + QUOTO | tabelle statiche | **Bassa** |
| 23 | Callback widget «lascia il numero, ti richiamiamo» sui flussi di preventivo | RCPolizza | QUOTO | assente | **Bassa** |
| 24 | IBAN virtuale per collaboratore | Plurima | IAM | assente | **Bassa** (dipende da banca) |
| 25 | Registro telefonate + riconoscimento chiamante | AssiEasy | IAM | assente | **Bassa** |

---

## 6. Schema dati proposto per le voci ad alta priorità

Bozza per Supabase, coerente con l'istanza già condivisa QUOTO/IAM:

```
-- 1,3: tassonomia + domande di modello
rami(id, codice, descrizione)
gruppi(id, ramo_id, descrizione, ordine)
professioni(id, gruppo_id, descrizione, ordine, attiva)
sottoprofessioni(id, professione_id, descrizione, ordine, attiva)
modelli_prodotto(id, professione_id, sottoprofessione_id, compagnia, quick bool, attivo)
domande_modello(id, modello_id, testo, tipo, opzioni jsonb, obbligatoria, ordine)

-- 2,4: sessione di preventivo
preventivi(id, session_token, id_ramo, id_gruppo, id_professione, id_sottoprofessione,
           stato, dati jsonb, questionario jsonb, risposte_modello jsonb,
           email, telefono, consenso_privacy, consenso_mkt, consenso_terzi,
           utente_id, creato_il, aggiornato_il)
preventivi_proposte(id, preventivo_id, compagnia, premio, massimale, garanzie jsonb,
                    selezionata bool)

-- 5: catena di stato
-- stato ∈ preventivo|proposta|questionario_inviato|questionario_firmato|
--          proposta_firmata|in_incasso|incassato|emessa|annullata
preventivi_eventi(id, preventivo_id, da_stato, a_stato, attore, email_inviata, quando)

-- 6: onboarding intermediario
collaboratori(id, iam_utente_id, cf, rui_numero, rui_data, qualifica,
              indirizzo jsonb, indirizzo_certificato bool,
              accordo_firmato_il, accordo_documento_id, puo_emettere bool)

-- 7,8: provvigioni ed estratto conto
provvigioni_regole(id, collaboratore_id, ramo_id, prodotto_id, garanzia,
                   modalita, -- retrocessione | perc_premio | aliquota_imponibile
                   aliquota_acquisto, aliquota_incasso, aliquota_diritti,
                   valida_dal, valida_al)
estratti_conto(id, collaboratore_id, aperto_il, chiuso_il, chiuso_da,
               totale_provvigioni, stato, -- aperto|chiuso|pagato
               pagato_il, riferimento_bonifico)
```

Non è un'implementazione: è il minimo che serve perché le voci 1-8 della tabella §5 stiano in
piedi insieme invece che come pagine scollegate.

---

## 7. Cautele

- **Compliance, non estetica.** Se replichiamo il flusso di RCPolizza dobbiamo replicarne anche i
  vincoli: Allegati 3 e 4 prima della raccolta dati, dichiarazione ex **art. 119-ter CAP** se non
  facciamo consulenza personalizzata, RUI visibile, pagina reclami e link all'Arbitro assicurativo.
  Tutte e tre le piattaforme li espongono; non è un caso.
- **Collaborazione fra intermediari.** Il gate "accordo firmato ⇒ puoi emettere" di Plurima non è
  una scelta di UX: è come si dimostra la collaborazione ex art. 22 DL 179/2012. Va replicato con
  quella funzione, non come passaggio decorativo.
- **Consensi separati.** Tutte usano tre consensi distinti (gestione del rapporto / marketing
  proprio / marketing di terzi) con il terzo esplicitamente facoltativo. Copiare la struttura,
  scrivere i nostri testi.
- **Contenuti e tariffe.** Elenchi di professioni e schemi di questionario sono struttura, e si
  possono replicare. Testi di polizza, condizioni, fascicoli e tariffe no: quelli sono delle
  compagnie e vanno dai nostri accordi.
- **Dati rilevati a luglio 2026.** I numeri di AssiEasy (770 intermediari, elenco compagnie con
  flusso) vengono da materiale datato: da riverificare prima di usarli in una comparazione.
