# IAM — stato reale del sistema e piano di completamento

> Obiettivo dato da Francesco: **un gestionale completo**, con tutti i processi
> che funzionano — cliente, contabilità, preventivazione, documentale,
> collaboratori, marketing. Innovativo e intuitivo, ma **soprattutto
> funzionante**.
>
> Questo documento parte da un esame del codice che c'è, non da un desiderio.
> Sostituisce, come punto di partenza, gli altri documenti di analisi:
> `CRM.md` (schemi dati) e `ASSIEASY-INTEGRAZIONE.md` (confronto)
> restano validi come riferimento tecnico.

---

## 1. Prima cosa, e va detta: il sistema non è rotto

Esame automatico del 29/07/2026 su entrambe le applicazioni:

| | IAM | QUOTO |
|---|---|---|
| Funzioni definite | 554 | 1.116 |
| Funzioni richiamate dall'interfaccia | 252 | 401 |
| **Richiami a funzioni inesistenti** | **0** | **0** |
| Errori JavaScript all'avvio | 0 | 0 |
| Prove di collaudo | 9 | 89 |

**Non c'è un solo bottone morto in 27.000 righe.** È un risultato tutt'altro
che ovvio e va detto prima di ogni critica: il lavoro fatto finora è solido.

Il problema non è la qualità di ciò che c'è. È che **alcune aree non ci sono**, e
una in particolare è un guscio.

---

## 2. Lo stato dei sei processi, senza sconti

### 🟢 Preventivazione — la parte più forte
22 pagine prodotto, 8 moduli quotabili in piattaforma, **7 scraper di compagnia
in produzione** con sessione persistente e riavvio automatico. Doppia modalità
(quotazione autonoma / richiesta all'ufficio) già modellata a database.

*Buchi:* 8 prodotti sono dichiarati nel menu ma rimandano a «In sviluppo».
Il catalogo a database ha 8 prodotti su ~22 pagine esistenti.

### 🟢 Collaboratori — solida
Squadra (12), utenti con **13 permessi granulari** e la loro interfaccia,
KPI e gare, diario di lavoro (198 registrazioni), conto e bonifici,
validazione RUI con veste.

*Buchi:* la gerarchia distributiva è piatta (solo `rete`): manca
produttore/subagenzia/filiale per provvigioni e statistiche.

### 🟡 Cliente — esiste ma è frammentato in tre posti
Lo stesso cliente vive in tre archivi diversi che non si parlano:

| dove | cosa | righe |
|---|---|---|
| `quote_anagrafiche` (QUOTO) | l'anagrafica vera | 35 |
| `iam_trattative` (IAM) | la trattativa commerciale | 23 |
| `iam_lead` (IAM) | i contatti da lavorare | **0** |

Chi apre una scheda cliente non vede la sua storia: vede una delle tre facce.
Manca la **vista unica con la cronologia**, che in un gestionale è il cuore.
E i **beni** (veicoli, immobili) non sono entità del cliente: vivono dentro il
json di ogni preventivo e si ridigitano ogni volta.

### 🟡 Contabilità — c'è metà, e manca la metà che riguarda i soldi dei clienti
**C'è** (e funziona) la contabilità dei collaboratori: carico documenti,
anomalie, sospesi, storico movimenti, conto, estratto conto.

**Manca** tutta la contabilità di rata:
- i **titoli** (prime rate, rate, quietanze, appendici) — la tabella
  `quote_titoli` esiste dal 29/07 ma è vuota e non ha interfaccia;
- il **quietanzamento**: generare le quietanze del periodo;
- gli **incassi**: chi ha pagato, con che mezzo, e gli **insoluti**;
- la **quadratura di giornata**.

⚠️ Due voci del menu IAM promettono già queste funzioni con
l'etichetta «in arrivo»: *Titoli e quietanze* e *Quadratura di giornata*.
Sono promesse fatte agli utenti e non mantenute.

### 🟡 Documentale — nuovo, da completare
Costruito il 29/07: checklist di pratica con requisiti, tre stati
(mancante → caricato → firmato) e perfezionamento calcolato.

*Buchi:* l'elenco dei requisiti è incompleto rispetto agli adempimenti che
l'agenzia già gestisce altrove (mancano Allegato 3, Allegato 4/4bis/4ter,
Coerenza e Appropriatezza, Questionario, Raccomandazione); manca il
contrassegno **validato** (oggi «caricato» e «verificato» sono la stessa cosa);
manca la visibilità al portale cliente; `quote_documenti` (documentale di
prodotto: condizioni, DIP, set informativi) è **vuota**.

### 🔴 Marketing — è un guscio
Il pannello *Lab · Marketing* contiene **due tasti**: uno apre i Lead, l'altro
apre una dashboard esterna. La tabella dei lead ha **0 righe**: la funzione
esiste nel codice ma non è mai stata usata.

Non c'è: campagne, invii, segmenti, compleanni, recupero disdette, misurazione.
Brevo è collegato **agli agenti AI**, non all'applicazione: oggi una campagna si
fa chiedendola a Jennifer, non dal gestionale.

**È l'area con la distanza più grande fra quello che il menu promette e quello
che il sistema fa.**

---

## 3. Il piano: cinque blocchi, in questo ordine

L'ordine non è arbitrario. Prima si chiude la catena che riguarda il denaro dei
clienti (senza quella non è un gestionale), poi si rende visibile tutto ciò che
esiste, poi si unifica il cliente, poi il marketing, infine il resto.

### Blocco A — La catena del denaro *(la priorità)*
`quote_titoli` esiste vuota: va riempita e resa lavorabile.

1. **Generazione dei titoli** da una polizza: il frazionamento (annuale,
   semestrale, quadrimestrale, trimestrale, mensile) genera le rate con date e
   importi, calcolate — mai digitate a mano.
2. **Pagina Titoli e quietanze**: elenco con scadenze, stato, insoluti;
   filtri per periodo, stato, cliente, compagnia. Sostituisce la voce
   «in arrivo» del menu.
3. **Incasso**: segnare un titolo incassato con mezzo di pagamento (contante,
   assegno, bonifico, POS, carta) e pagatore. In blocco, non uno per uno.
4. **Insoluti**: chi non ha pagato ed è scaduto. È la lista che recupera soldi.
5. **Quietanzamento del periodo**: generare in blocco le quietanze di rinnovo
   delle polizze in scadenza.

*Perché prima:* è l'unica area dove il menu promette e il sistema non consegna;
accende il terzo semaforo del portafoglio (rendicontazione), oggi sempre grigio;
e sono soldi che si recuperano.

### Blocco B — La scrivania che dice cosa fare oggi *(la svolta)*
Adesso ci sono i dati per farlo: polizze, scadenze, documenti mancanti, titoli
insoluti, preventivi da richiamare.

Invece di una scrivania che mostra numeri, una scrivania che propone **azioni**,
ognuna con il suo conteggio e il collegamento diretto:

> 4 rinnovi da lavorare entro 30 giorni · 12 polizze da perfezionare ·
> 3 titoli insoluti per 1.240 € · 7 preventivi in attesa da più di 5 giorni ·
> 2 compleanni questa settimana

Ogni riga porta all'elenco già filtrato. Chi apre il gestionale la mattina sa
cosa fare senza cercarlo. È la differenza fra un archivio e uno strumento —
ed è il pezzo che rende percepibile tutto il lavoro già fatto.

### Blocco C — Un solo cliente, con la sua storia
1. Unire le tre facce (anagrafica, trattativa, lead) in **una scheda**.
2. **Cronologia** di tutto ciò che riguarda il cliente: preventivi, polizze,
   incassi, documenti, sinistri, comunicazioni. La materia prima c'è già:
   `iam_audit` e `quote_log` hanno 340 registrazioni.
3. **Beni riutilizzabili** (veicoli, immobili, attività): si scelgono da elenco
   invece di ridigitarli a ogni preventivo.

### Blocco D — Marketing che funziona davvero
1. **Lead con fonte e campagna**, stato e assegnatario: la tabella esiste, va
   riempita e resa lavorabile.
2. **Campagne dall'applicazione**: segmento → bozza → conferma → invio via
   Brevo, con le regole di sicurezza già stabilite (mai invio senza conferma).
3. **Occasioni automatiche**: compleanni, polizze in scadenza senza rinnovo,
   disdette da recuperare, clienti con un solo prodotto (vendita incrociata).
4. **Misurazione**: quanti contattati, quanti hanno risposto, quanti hanno
   comprato.

### Blocco E — Completamenti
Gli 8 prodotti «in sviluppo»; sinistro strutturato (partite di danno e
controparti); prodotto versionato; gerarchia distributiva; coassicurazione;
unificazione delle due code di ticket; requisiti documentali corretti.

---

## 4. Come si lavora, per non rompere ciò che funziona

Le regole restano quelle di `CRM.md` §4. In sintesi, le tre che
contano di più su un sistema in produzione:

1. **Un blocco per volta, pubblicabile e reversibile.** Ogni pezzo si chiude con
   collaudo verde, schermata guardata con gli occhi, e pubblicazione.
2. **Si aggiunge, non si sostituisce.** Ciò che funziona continua a funzionare:
   le colonne vecchie restano scritte finché il nuovo non è verificato in
   produzione.
3. **Niente dati inventati.** Soglie, percentuali, aliquote, durate: se non
   c'è un dato ufficiale si chiede. In contabilità questa regola non ha
   eccezioni.

E una nuova, imparata il 29/07: **dopo ogni migrazione si esegue il controllo di
sicurezza di Supabase**, e ogni vista ricreata riapplica `security_invoker`.

---

## 5. Cosa resta in mano a Francesco

Tre decisioni che non posso prendere io, e che sbloccano lavoro già pronto:

| decisione | sblocca |
|---|---|
| Quali documenti rendono una polizza **perfezionata** | il secondo semaforo del portafoglio |
| La **durata** dei prodotti vita (TCM, Vita/Risparmio) | la scadenza automatica su quei prodotti |
| **Provvigioni**: percentuali e regole di rendicontazione | il terzo semaforo e gli estratti conto del Blocco A |

La terza è la più urgente: è dentro il Blocco A e riguarda il denaro, quindi
nessun numero verrà inventato in attesa della risposta.
