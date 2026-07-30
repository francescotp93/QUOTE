# Plurima by Italnext — mappa di lavoro

Documento operativo per l'agente che sta esplorando `portale.plurima.net` da un browser loggato.
Serve a due cose: **dirti cosa è già mappato** (così non lo rifai) e **dirti cosa manca** (così
sai dove andare). Aggiorna le sezioni «DA RILEVARE» man mano che le copri.

Ultimo aggiornamento: luglio 2026.

## Legenda dello stato

| Simbolo | Significato |
|---|---|
| ✅ | **Confermato dall'interno** — osservato su utenza reale loggata |
| 🟢 | **Confermato da HTML servito** — letto nello scheletro dell'app o nelle pagine pubbliche |
| 🟡 | **Dedotto** — da sito pubblico, FAQ o materiale commerciale; da verificare dentro |
| ❌ | **Non rilevato** — buco aperto, priorità di esplorazione |

## Regole per l'esplorazione

1. **Non completare mai** emissioni, pagamenti, firme, chiusure di estratto conto o denunce di
   sinistro. Arriva alla schermata precedente e descrivi cosa succederebbe.
2. **Non riportare dati di clienti reali**: nomi, codici fiscali, targhe, indirizzi, numeri di
   polizza, importi personali. Sostituiscili con `<cliente>`, `<targa>`, `<polizza>`, `<importo>`.
3. **Label esatti, non parafrasi.** Se la voce dice «Estratto conto provvigionale», scrivi quella
   stringa. È l'unico modo per capire se una funzione corrisponde davvero a una nostra.
4. Se non riesci ad accedere a qualcosa, scrivi «non accessibile» invece di dedurre.

---

## 1. Identità e modello di business

- 🟢 **Italnext srl** — RUI **A000531290**, Lloyd's OMC 190173, P.IVA 11998320011,
  Via Francesco Ferrucci 2, 20145 Milano. Tel. 02 91430411. Società del **Reale Group**,
  soggetta a direzione e coordinamento di Reale Mutua.
- 🟡 Nata nel **2015** come società controllata al 100% da Italiana Assicurazioni per erogare
  servizi alle agenzie di Reale Group; dal **2018** gli accordi si estendono agli intermediari di
  mercato (oltre 700 accordi dichiarati); a **giugno 2023** Italiana Assicurazioni acquisisce la
  maggioranza di **Plurima Servizi Assicurativi srl**; dal **2024** nasce «Plurima by Italnext».
- 🟢 La piattaforma è **riservata alla collaborazione fra intermediari** — non vende al cliente
  finale. Modello wholesale: catalogo multi-compagnia messo a disposizione di agenti e broker.
- 🟡 Iscrizione **gratuita**, **nessuna penale** di uscita, nessun minimo di produzione.
  «Più polizze emetti, più vantaggi avrai» — coerente col sistema a livelli osservato al §4.

---

## 2. Onboarding

🟢 Rilevato da `portale.plurima.net/registrazione.php` (pubblico).

**Step 1 — verifica dell'intermediario, prima di ogni altra cosa**

| Campo | Nome tecnico | Obbligatorio |
|---|---|---|
| Codice fiscale | `cf_registrazione` | sì |
| Numero iscrizione al RUI | `rui_registrazione` | sì |
| Data di iscrizione al RUI | `data_registrazione` | — |
| Accettazione condizioni | `condizioni_1` | sì |

**Step 2 — indirizzo normalizzato**
Campi Indirizzo / Numero civico / Provincia / Comune / CAP, con **certificazione via Google
Places**: se l'indirizzo non è riconosciuto compare *«Attenzione: indirizzo non certificato!
Inserire indirizzo corretto»* e una conferma esplicita *«Confermare il seguente indirizzo?»*.

**Step 3 — utente**
`rui_registrazione_2`, `data_iscrizione_rui`, `cf_registrazione_2`, `nome_utente_registrazione`,
`cognome_utente_registrazione`, `data_nascita_registrazione`, `luogo_nascita_registrazione`,
`qualifica_registrazione`, `sesso_registrazione`, `username_utente_registrazione`,
`password_registrazione` (+ ripeti), `email_registrazione`, `telefono_registrazione`.
Per le società: `Company Name`, `Company URL` (`webUrl3`), `Short Description` (`shortDescription`).

**Gate all'emissione**
🟡 Ci si registra e si vedono **catalogo e preventivatore**; si firma l'**accordo di collaborazione**
dal proprio profilo e solo allora **si può emettere**.

### DA RILEVARE
- ❌ Dove sta esattamente l'accordo di collaborazione nel profilo, come si firma (FEA? OTP?), e se
  l'interfaccia mostra esplicitamente che la firma sblocca l'emissione.
- ❌ Cosa vede un utente registrato ma non ancora convenzionato.

---

## 3. Navigazione

✅ Menu laterale a **sei voci**:

```
Prodotti        >
Preventivi      >
Richieste
Portafoglio     >
Utilità         >
Amministrazione >
```

✅ **Topbar**: hamburger per collassare il menu · **ricerca globale** con placeholder che suggerisce
cosa cercare («Prova a cercare *asseverazioni*») · **numero verde sempre visibile** con icona
operatore · campanello notifiche con contatore · menu utente.

### DA RILEVARE
- ❌ **Il sottomenu completo di ognuna delle sei voci**, con i label esatti. È il buco più grosso.
- ❌ Cosa cerca la ricerca globale: solo prodotti, o anche polizze, clienti, documenti? Che aspetto
  hanno i risultati?
- ❌ Cosa contiene il centro notifiche e che tipi di notifica esistono.

---

## 4. Scrivania (home)

✅ Osservata su utenza reale. Breadcrumb «Scrivania».

**Fascia «I nostri consigli»** — tre card:

| Card | Contenuto |
|---|---|
| **In evidenza** (badge *News*) | «Nuovi prodotti tailor made»: Medico Protetto – Libero professionista · AmTrust Pubblico impiego · Professioni intellettuali · Colpa Grave Extra · Professioni sanitarie |
| **Funzioni più utilizzate** | *Polizze emesse* · *Fai un preventivo* · **Chiudi estratto conto** |
| **Ti suggeriamo di** | *Controllare la documentazione* **(contatore)** · *Gestire i rinnovi* · *Controllare le richieste* |

**Fascia «Tu al centro del nostro lavoro»** — tre card:

| Card | Contenuto |
|---|---|
| **I tuoi numeri** | «Il tuo portafoglio» → **«Provvigioni da rendicontare € \<importo\>»** |
| **A te la parola** | *Scegli l'argomento* (select) + testo libero + documenti (opzionale) |
| **Il tuo livello** | Badge di membership — osservato **SILVER** |

**Perché conta**: che «Chiudi estratto conto» stia fra le tre funzioni più usate è la conferma
dall'interno che la chiusura self-service è una delle ragioni per cui la rete torna. E il saldo
provvigionale è il **primo numero della home**, non una pagina di secondo livello.

### DA RILEVARE
- ❌ **Quali livelli esistono oltre a Silver** (Bronze? Gold? Platinum?), **come si sale**, e **cosa
  cambia concretamente** per livello: provvigioni, accesso a prodotti, priorità di assistenza.
  Cerca un tooltip, una pagina «il tuo livello», un regolamento.
- ❌ Cosa apre «Controllare la documentazione» e perché ha un contatore: sono documenti mancanti da
  caricare? Polizze incomplete?
- ❌ Gli argomenti disponibili nella select di «A te la parola».
- ❌ Se la Scrivania è personalizzabile (spostare o nascondere card).

---

## 5. Prodotti

🟡 Catalogo multi-compagnia, «prodotti di diverse compagnie aderenti al progetto», ampliato di
continuo. ✅ Fra i «tailor made» in evidenza: **Medico Protetto**, **AmTrust Pubblico impiego**,
**Professioni intellettuali**, **Colpa Grave Extra**, **Professioni sanitarie** — quindi c'è una
forte componente **RC professionale e sanitaria**, lo stesso terreno di `page-rcprof` in QUOTO.

🟢 **Tassonomia a 5 livelli**: `select_cel_tpa_primo_livello` … `quinto_livello`, cascata popolata
via AJAX. Il primo livello si apre su **«Cointermediazione»**. Un livello **più profondo** dei 4 di
RCPolizza (ramo → gruppo → professione → sottoprofessione).

🟡 Esistono prodotti **«QUICK»** a emissione rapida e totalmente autonoma, distinti da quelli che
richiedono assunzione o supporto del team.

### DA RILEVARE — priorità massima
- ❌ **Come si naviga il catalogo**: per compagnia, per ramo, per esigenza, per ricerca?
- ❌ **Elenco delle compagnie presenti** e, per ciascuna, i prodotti disponibili.
- ❌ **I cinque livelli della tassonomia, con le opzioni reali di ciascuno.** Apri le select e
  riporta i valori: è la struttura dati che ci interessa di più.
- ❌ **Come sono marcati i prodotti QUICK** rispetto agli altri (badge? sezione dedicata?).
- ❌ Se è indicata la **provvigione per prodotto**, e dove.
- ❌ Cosa mostra la scheda di un singolo prodotto: documentazione, condizioni, massimali, target.

---

## 6. Preventivi

🟡 **Un unico questionario valutativo** produce preventivi da **più compagnie**, poi si confrontano
le offerte e si sceglie. È il nodo centrale: è lo stesso problema che abbiamo in QUOTO, dove oggi
ogni prodotto ha il suo form.

🟢 Esiste un **`carrello.js`**: l'acquisto sembra essere **multi-prodotto in un'unica transazione**.

### DA RILEVARE — priorità massima
- ❌ **Il flusso completo del questionario**: quanti step, titolo di ogni step, **tutti i campi** di
  ciascuno con tipo (testo / data / select / checkbox) e, per le select, le opzioni.
- ❌ **Quali campi sono comuni a tutti i prodotti e quali cambiano** in base al prodotto scelto.
  È la distinzione che ci serve per progettare il nostro questionario unico.
- ❌ Come si sceglie il contraente: persona fisica / giuridica, e se si può **riusare o cercare
  un'anagrafica esistente** invece di riscriverla.
- ❌ **La pagina di confronto**: cosa mostra ogni proposta (compagnia, premio, massimale, franchigia,
  garanzie, provvigione?), quali filtri e ordinamenti, se si possono **aggiungere o togliere
  garanzie con ricalcolo** del premio.
- ❌ Se il preventivo si **salva**, che numero prende, quanto **dura**, e se si può **inviare al
  cliente** (con quale mezzo).
- ❌ Come funziona il carrello: si mettono più prodotti dello stesso cliente? Di clienti diversi?

---

## 7. Emissione

🟡 Emissione **autonoma** su gamma ampia, **assistita** dal team sui rischi particolari.
Generazione automatica di tutta la documentazione contrattuale.
🟡 **Firma elettronica avanzata (FEA)** inclusa nella piattaforma.
🟡 **IBAN virtuale gratuito** per l'intermediario.

### DA RILEVARE
- ❌ I passaggi dal preventivo alla polizza, **senza completarli**.
- ❌ Quali documenti vengono generati e in che momento.
- ❌ Come funziona la FEA: chi firma, OTP via SMS o email, cosa vede il cliente.
- ❌ **L'elenco degli stati** che una pratica può assumere, con i nomi esatti.
- ❌ Dove compare l'IBAN virtuale e come viene usato per riconciliare gli incassi.

---

## 8. Richieste e ticket

🟢 **Form ticket / richiesta quotazione**, campi rilevati dallo scheletro dell'app:

```
Ambito *              Compagnia *           Tipo richiesta *
Prodotto *            Tariffa *             Data effetto *
Frazionamento *       Numero polizza *      Targa *
Premio *              Garanzie *            Note
Tipologia di firma della polizza *          Motivazione *
Documenti Allegati    (upload multiplo)
```

🟡 Per i rischi **non in catalogo** si apre un ticket e il team assuntivo risponde con una
quotazione. 🟡 Sui **sinistri**, si carica la documentazione e **il ticket viene generato
automaticamente**.

### DA RILEVARE
- ❌ Le opzioni delle select: **Ambito**, **Tipo richiesta**, **Tipologia di firma della polizza**,
  **Motivazione**. Sono le più informative del form.
- ❌ Gli **stati** di una richiesta e i tempi dichiarati di risposta.
- ❌ Se «Richieste» nel menu è la stessa cosa dei ticket o un'area distinta.

---

## 9. Portafoglio

🟡 Dashboard portafoglio «sempre disponibile», visualizzazione delle polizze in piattaforma.
✅ Fra i suggerimenti della Scrivania compare **«Gestire i rinnovi»**, quindi esiste una gestione
scadenze/rinnovi dedicata.

### DA RILEVARE — priorità alta
- ❌ **Le colonne della lista polizze** e i **filtri** disponibili.
- ❌ Esportazioni: quali formati (la piattaforma usa DataTables con export Excel/PDF/stampa).
- ❌ Come si fanno **appendici, sostituzioni, annullamenti**.
- ❌ Com'è fatto lo **scadenzario / gestione rinnovi**: con quanto anticipo, che azioni si possono
  fare, se ci sono solleciti automatici.

---

## 10. Estratto conto e provvigioni

🟡 Controllo del saldo provvigionale in tempo reale.
🟡 **Chiusura estratto conto on demand**: non si aspetta fine mese, l'intermediario chiude quando
vuole e riceve il **bonifico** delle provvigioni maturate.
🟡 Storico delle provvigioni già incassate.
✅ **«Chiudi estratto conto» è fra le tre funzioni più utilizzate** della piattaforma.
✅ **«Provvigioni da rendicontare»** è il primo numero della home.

### DA RILEVARE — priorità alta
- ❌ Com'è fatta la schermata: quali totali mostra (maturato, da rendicontare, incassato), con che
  granularità (per polizza? per compagnia? per periodo?).
- ❌ **Il flusso di chiusura**: quale bottone, quali conferme, che documento produce, cosa succede
  dopo. **Fermati prima di chiudere davvero.**
- ❌ Le colonne dello **storico** delle provvigioni incassate.
- ❌ Se esiste una distinzione fra provvigioni su nuovo affare e su rinnovo/incasso.

---

## 11. Multiutenza e rete

🟡 Agenti e broker possono creare **sotto-utenze** per collaboratori e subagenti, che operano
«secondo il livello di autonomia impostato dal profilo principale».

### DA RILEVARE — priorità alta
- ❌ **L'elenco esatto dei livelli di autonomia / permessi** assegnabili. Riporta le opzioni testuali.
  È direttamente confrontabile con i nostri ruoli `top_master` / `master` / `operativo`.
- ❌ Cosa vede una sotto-utenza rispetto al profilo principale.
- ❌ Se le provvigioni si possono ripartire fra profilo principale e sotto-utenze.

---

## 12. Utilità e Amministrazione

❌ **Interamente da rilevare.** Sono due delle sei voci di menu e non ne sappiamo nulla.
Ipotesi da verificare: sotto Amministrazione dovrebbero stare profilo, accordo di collaborazione,
sotto-utenze, dati societari, documenti fiscali; sotto Utilità strumenti di supporto, download,
tutorial.

---

## 13. Modulo campagne / back-office in outsourcing

🟢 Rilevato dallo scheletro dell'app. **Non è una funzione: è una linea di business.** L'agenzia
commissiona a Italnext l'estrazione dal portafoglio, la lavorazione, i preventivi e la presa
appuntamenti. Campi del form:

```
Denominazione campagna *          Tipo campagna *
Data inizio campagna *            Data termine campagna *
Ramo da lavorare *                Selezione Compagnia *
Selezione Listino *               Seleziona Prodotto *
Tipologia di clienti *            Numero clienti selezionati *
Condizioni da applicare per l'estrazione *
Esclusioni di rami di polizza o intermediario *
Colonne visualizzabili nelle liste *
Periodicità lista *               Tipo lista backoffice *
Media mensile di pezzi da lavorare *
Frequenza lavorazione *           Tempo termine lavorazione *
Tempo di ricezione preventivi *
«Sulle mail correttamente recapitate, vuoi effettuare la presa appuntamenti?
 Se SI, con quale disponibilità» *
Formato *                         Tipologia di suddivisione stampe in pdf *
Tipo variazione *                 Codice agenzia *
```

### DA RILEVARE
- ❌ **Dove si trova questo modulo nel menu** e se è accessibile a tutti gli intermediari o solo ad
  alcuni livelli.
- ❌ Se è a pagamento e con che logica.
- ❌ Le opzioni di **Tipo campagna** e **Tipo lista backoffice**.

---

## 14. Integrazioni tecniche rilevate

🟢 Tutte lette dallo scheletro HTML servito senza login.

| Cosa | Dettaglio |
|---|---|
| **Endpoint** | dispatcher unico `/a__php/__ajax.php` |
| **Versione app** | `4.10.8543` |
| **Stack** | PHP · jQuery 3.5.1 · Bootstrap · DataTables (export Excel/PDF/stampa via buttons + pdfmake + jszip) · dropzone/dropify per gli upload · bootstrap-datepicker / daterangepicker |
| **Indirizzi** | **Google Places** — modale con indirizzo, civico, comune, CAP, provincia, «indirizzo formattato» e conferma esplicita |
| **Catasto** | **SISTER (Agenzia delle Entrate)** — modali «Ricerca immobile» → «Individua dati catastali» con **Foglio / Particella / Sub**, campo «Inserire il codice fiscale del proprietario», selezione dell'immobile da tabella risultati |
| **Carrello** | `carrello.js` — acquisto multi-prodotto in un'unica transazione |

**Nota**: l'endpoint AJAX **non va sondato** con chiamate costruite a mano. Si guarda quello che
l'interfaccia fa navigando normalmente, non si interroga il sistema di qualcun altro.

### DA RILEVARE
- ❌ In quali prodotti compare la ricerca catastale (casa? fabbricati? condominio?) e a che punto
  del flusso.
- ❌ Se l'indirizzo certificato viene riusato in tutti i form o solo in registrazione.

---

## 15. Le sette domande a cui serve rispondere

Se hai tempo per poco, rispondi a queste. Sono quelle da cui dipendono le decisioni su QUOTO e IAM.

1. **Com'è fatto il questionario valutativo unico** — quanti step, quali campi comuni e quali
   variabili per prodotto?
2. **Cosa mostra la pagina di confronto preventivi** e si possono modificare le garanzie con
   ricalcolo?
3. **Com'è fatta la schermata estratto conto** e qual è esattamente il flusso di chiusura?
4. **Quali sono i cinque livelli della tassonomia prodotti** e le loro opzioni?
5. **Quali livelli di membership esistono, come si sale, e cosa cambia per livello?**
6. **Quali livelli di autonomia** si possono assegnare a una sotto-utenza?
7. **Cosa contengono Utilità e Amministrazione?**

---

## 16. A cosa serve tutto questo

La mappa completa delle tre piattaforme analizzate (RCPolizza, Plurima, AssiEasy), con la
traduzione in funzioni da portare in QUOTO e IAM, sta in
`QUOTE/docs/MAPPA-RCPOLIZZA-PLURIMA-ASSIEASY.md`. La parte gestionale, orientata a IAM, sta in
`Agente-sospesi/MAPPA-GESTIONALE-ASSIEASY-IAM.md`.

Si mappano **funzioni e processi**, che sono idee di prodotto e non sono protette. Non si copiano
testi, grafica, codice, condizioni di polizza o tariffe: quelli vanno riscritti o negoziati.
