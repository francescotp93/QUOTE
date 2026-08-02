# AssiEasy e WITH US ONE — cosa ci facciamo

> Analisi della mappatura di AssiEasy (`withus.assieasy.com`) fatta da Francesco,
> letta alla luce di quello che WITH US ONE è oggi. Complemento a
> `CRM-WITH-US-ONE.md`: quel documento dice cosa costruire, questo dice
> **rispetto a cosa**.

---

## 1. AssiEasy non è un concorrente da studiare: è il vostro gestionale

Differenza sostanziale rispetto alla mappatura di Plurima:

| | Plurima / Italnext | **AssiEasy** |
|---|---|---|
| che cos'è | portale di un concorrente | **il gestionale che usate voi**, in produzione |
| i dati dentro | di altri | **i vostri**, veri |
| cosa se ne ricava | idee e schemi | idee, schemi **e una decisione da prendere** |

AssiEasy è **già dentro WITH US ONE**: menu *Strumenti → AssiEasy*, che apre
`withus.assieasy.com` in una scheda nuova (`withus-one.js`, riga 280).

Va notato — perché è esattamente la critica che il vostro documento muove ad
AssiEasy: quel gestionale non integra i 25 portali esterni, li **linka**. WITH US
ONE oggi fa la stessa identica cosa con AssiEasy. È un anello della stessa
catena, e vale la pena esserne consapevoli prima di aggiungerne un altro.

---

## 2. Il numero che cambia tutto

| | WITH US ONE (Supabase, oggi) | AssiEasy |
|---|---|---|
| Polizze | **5** | **7.637** |
| Anagrafiche | 35 | 4.817 |
| Premi annui | ~800 € | **~2,48 M€** |
| Sinistri | 0 | gestiti, con partite e controparti |
| Sospesi | non modellati | 86 per ~24,6 k€ |

**Il portafoglio vero non è dentro WITH US ONE.** Tutto ciò che abbiamo
costruito ieri — portafoglio, semafori, documentale, scadenzario — funziona su
5 polizze su 7.637, cioè sullo **0,07%** dell'agenzia.

Questo spiega, per esempio, perché il numero sulla voce Scadenzario dice 0: le
scadenze vere di questi mesi sono in AssiEasy, non da noi.

Non è un difetto di ciò che è stato costruito: l'ossatura serviva comunque. Ma
cambia la domanda successiva, che non è più *"quale funzione costruisco adesso"*
bensì **"dove vive il portafoglio da qui in avanti"**.

---

## 3. Le tre strade — e serve sceglierne una consapevolmente

### A. Migrazione — WITH US ONE diventa il gestionale
Si importano anagrafiche, polizze, titoli e sinistri da AssiEasy; poi si smette
di rinnovare la licenza.

*A favore:* un solo sistema, dati vostri, nessun canone, tutto integrato con i
preventivatori che avete già.
*Contro:* è il lavoro più grosso di tutti. Il vostro documento censisce
437 campi su polizza, 471 su titolo, 454 su sinistro: non si migra a mano.
Servono l'esportazione completa da AssiEasy e mesi di lavoro, con un periodo di
doppio inserimento.
*Da verificare per primo:* **AssiEasy esporta?** In che formato? Esiste
l'esportazione **SHARE** (il tracciato standard italiano di interscambio
assicurativo)? Se sì, la migrazione ha un ponte già pronto; se no, cambia tutto.

### B. Integrazione — AssiEasy resta l'archivio, WITH US ONE la faccia
WITH US ONE legge da AssiEasy (o ne riceve gli scarichi periodici) e diventa
l'interfaccia quotidiana, con sopra i preventivatori e i vostri scraper.

*A favore:* niente migrazione, il portafoglio è subito completo nelle nuove
schermate, si tiene la rete di sicurezza del gestionale.
*Contro:* dipendenza da un fornitore terzo e dalla sua disponibilità a fornire
API o scarichi. Il vostro documento non censisce API pubbliche di AssiEasy:
**va chiesto a SAVE S.r.l.**

### C. Convivenza — ognuno il suo pezzo
WITH US ONE per il nuovo (quotazione ed emissione, dove stanno i vostri
scraper), AssiEasy per lo storico e la contabilità.

*A favore:* zero lavoro aggiuntivo.
*Contro:* è la situazione di **oggi**, e non è una scelta: è ciò che succede se
non se ne fa una. I dati si allontanano ogni giorno, e fra un anno la
migrazione costa il doppio.

**La mia raccomandazione:** partire da **B**, con **A** come traguardo. Prima si
chiede a SAVE che cosa si può esportare e con che frequenza; con quello in mano
si decide se WITH US ONE diventa la faccia (B) o l'erede (A). Quello che non
consiglio è restare in C senza averlo deciso.

---

## 4. Cosa conferma di quanto già costruito

Buone notizie: le scelte strutturali del 29/07 reggono il confronto con un
gestionale maturo con 7.637 polizze dentro.

| scelta nostra | riscontro in AssiEasy |
|---|---|
| `sostituisce_id` come **relazione**, non modifica | «Sostituzione» è un'operazione di prima classe, distinta da Modifica e Duplica |
| Titolo figlio della polizza, non del cliente | catena dichiarata `TIT → POL → ANA` |
| Documentale **polimorfico** (`entita` + `entita_id`) | aggancio a `ANAGRAFICA / POLIZZA / TITOLO / SINISTRO / ALTRO` |
| Anagrafica come radice | `ANA` è la radice di tutte le catene |
| Preventivo separato dalla polizza | entità distinte, unite da un **abbinamento** esplicito |
| Ciclo di vita del titolo | da emettere → avvisato → incassato → sospeso → mora → contenzioso |

Un'unica differenza di impostazione: da noi il preventivo diventa polizza
all'emissione; là esiste un'azione **«Abbina alle polizze»** che collega un
preventivo a una polizza già esistente. Serve quando la polizza arriva dalla
compagnia per altre vie — cioè quasi sempre, in cointermediazione.

---

## 5. Cosa manca al nostro modello, in ordine di peso

1. **Sinistro con struttura interna.** Il nostro `quote_sinistri` è piatto
   (`controparte`, `danni_persone`, `danni_cose` come campi). Là **partite di
   danno** e **controparti** sono entità multiple e filtrabili di primo livello.
   Un sinistro con tre danneggiati non entra nel nostro modello.
2. **Prodotto con versione.** 183 prodotti su 87 nomi distinti: le tariffe sono
   versionate nel tempo. Il nostro `quote_prodotti_catalogo` non ha versione né
   validità: in una migrazione si perderebbero le tariffe storiche.
3. **Gerarchia distributiva.** 679 subagenzie contro 24 compagnie: la
   complessità è nella distribuzione. Noi abbiamo `rete` sull'utente e basta.
   Servono i livelli produttore / subagenzia / filiale / gruppo per provvigioni
   e statistiche.
4. **Coassicurazione.** Riparti fra compagnie su una stessa polizza: da noi non
   esiste il concetto.
5. **Quietanzamento.** La *generazione* delle quietanze in blocco, gli avvisi di
   scadenza, le divergenze di quietanzamento («difesa portafoglio»). È il Punto 7
   del piano, e questo ne mostra la dimensione reale.
6. **Sospesi e contenzioso.** Stati del titolo che non abbiamo previsto
   (`quote_titoli` arriva fino a `insoluto`): mancano mora e contenzioso.
7. **Dizionario dati come metadato.** Ogni campo descritto da un record con
   tipo, tabella di decodifica e flag di visibilità. È l'idea architetturale più
   riutilizzabile del sistema: permette di generare moduli, estrazioni e mappe
   di migrazione **senza scriverli a mano**. Da valutare per il catalogo
   prodotti, dove abbiamo già `campi_offerta`.
8. **Agenda come coda di squadra.** Aree di lavoro (Sinistri / Rami Elementari /
   Auto) con richieste assegnabili: è il Punto 6 (ticket unificati) visto da un
   sistema che lo fa da anni. Nota: là l'agenda fa anche **ferie e permessi** —
   secondo me da tenere separato, non è la stessa cosa.

---

## 6. I documenti: qui c'è la risposta alla domanda che avevo lasciata aperta

Ieri ho costruito il documentale di pratica e ho segnalato che l'elenco dei
requisiti era **da confermare**, perché decide quando una polizza si considera
perfezionata. AssiEasy contiene la risposta, perché quei tipi documento
riflettono gli obblighi di distribuzione assicurativa (IVASS/IDD):

| oggi in WITH US ONE | in AssiEasy |
|---|---|
| Polizza firmata | Polizza |
| Informativa privacy | Privacy |
| Documento d'identità | Documento di identità |
| Dichiarazione di presa visione | — |
| — | **Allegato 3** |
| — | **Allegato 4**, **4 Bis**, **4 Ter** |
| — | **Coerenza / Appropriatezza** (adeguatezza) |
| — | **Questionario** (analisi delle esigenze) |
| — | **Raccomandazione** personalizzata |
| — | Autorizzazione alla FEA |
| — | Mandato broker · Documenti Azienda · Accompagnatoria |

**Il nostro elenco è incompleto rispetto a quello che l'agenzia usa davvero.**
Non lo cambio da solo: quali documenti rendano una polizza perfezionata è una
decisione vostra e ha risvolti normativi. Ma la proposta la faccio, perché ora è
fondata su come lavorate.

Mancano anche i tre **contrassegni di governo** che AssiEasy mette su ogni
documento e che noi non abbiamo:
- **riservato** — non visibile a tutti gli operatori;
- **visibile al portale cliente** — esposizione verso l'esterno;
- **validato** — qualcuno ha verificato che il documento è buono.

Il terzo è quello che più ci manca: oggi da noi «caricato» e «verificato» sono
la stessa cosa.

---

## 7. Cosa NON replicare

Il vostro documento lo segnala già ed è giusto ribadirlo: in AssiEasy la
password del portale cliente (`PWD_HOME_INS`) è **conservata e mostrata in
chiaro** nella scheda anagrafica. In WITH US ONE questo non deve accadere mai:
le credenziali si conservano cifrate a senso unico, non si mostrano a nessun
operatore, e si recuperano solo con una procedura di reimpostazione.

Regola generale già in vigore da noi (`CRM-WITH-US-ONE.md` §4.5): niente
credenziali in chiaro, da nessuna parte.

---

## 8. Dove siete già avanti — e vale più di quanto sembri

Il vostro documento indica come «gap più sfruttabile» il fatto che AssiEasy
**linka** 25 sistemi esterni senza integrarli: HDI, Groupama, Sara, Verti,
Wakam, Prima.it, Allianz, Preventivass, SIC ANIA…

Ma quel lavoro **voi lo avete già fatto**: WITH US ONE ha 7 scraper di compagnia
in produzione sul VPS, con sessione persistente e riavvio automatico. È
esattamente ciò che al gestionale manca.

Ne discende una conclusione strategica: nel confronto con AssiEasy voi non
partite da zero. Loro hanno l'archivio, voi avete l'integrazione con le
compagnie — che è la parte più difficile e più costosa da costruire. Se il
portafoglio arriva dentro WITH US ONE (strada A o B), il sistema che ne esce non
ha equivalenti fra quelli che avete visto.

---

## 9. Cosa mi manca del vostro documento

La mappatura che mi hai passato si interrompe a metà del §5.8 («il flag *Anche
Assicurativi* rivela la convivenza di due flussi:»). Restano fuori, e mi
servirebbero:

- **§6 Processi di business** — che il documento stesso indica come priorità di
  lettura numero 3 e come «il vero valore del dominio»;
- **§7** (qualunque cosa sia);
- **§8 API e convenzioni** — decisivo per capire se la **strada B è
  percorribile**: se AssiEasy espone endpoint utilizzabili, l'integrazione si può
  cominciare senza chiedere nulla a nessuno.

Se hai il resto, passamelo: il §8 in particolare può cambiare la
raccomandazione del §3.

---

## 10. Proposta operativa

**Prima di scrivere altro codice**, tre domande da risolvere — due con SAVE
S.r.l., una interna:

1. **AssiEasy esporta il portafoglio completo?** In che formato, con che
   frequenza, e comprende lo storico dei titoli? Esiste l'esportazione SHARE?
2. **Esistono API?** Anche in sola lettura basterebbe per cominciare la strada B.
3. **Interna:** quali documenti rendono una polizza perfezionata per Withus
   (§6)?

Le prime due determinano l'intero piano; la terza si risolve in cinque minuti e
sblocca subito il secondo semaforo del portafoglio.

Nel frattempo, il lavoro che ha senso comunque — perché serve in tutte e tre le
strade — è: **sinistro strutturato** (partite e controparti), **prodotto
versionato** e **gerarchia distributiva**. Sono i tre punti dove il nostro
modello si romperebbe il giorno in cui arrivassero 7.637 polizze.
