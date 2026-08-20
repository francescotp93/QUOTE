# Come rendere il sistema più snello

Documento per Francesco. Scritto leggendo il codice, senza modificare niente.

Abbreviazioni usate nelle prove:

- **QUOTO** = `/home/user/QUOTE/index.html` (1.330.830 byte, ~17.000 righe)
- **IAM** = `/workspace/agente-sospesi/index.html` (736.639 byte, ~11.500 righe)
- **scocca** = `/workspace/agente-sospesi/withus-one.js` (il menu e le barre comuni)
- **backend** = `/home/user/QUOTE/server/`, **scraper** = `/home/user/QUOTE/scraper/`

---

## 0. Come è stato scritto

### Il metodo

Ogni affermazione doveva portare una prova concreta: il file e il numero di riga,
oppure il comando esatto che l'ha mostrata. Poi è passata da un secondo giro di
controllo che aveva un compito solo: **cercare di smontarla**. Rifare i conti,
cercare il controesempio, controllare che una funzione dichiarata "morta" non
fosse chiamata da un `onclick=` dentro l'HTML (che una ricerca fatta male non
vede).

Questo secondo giro ha corretto parecchi numeri, quasi sempre di chi aveva
gonfiato. Qualche esempio, per far capire il tipo di lavoro:

- "6 voci di menu su 25 finiscono su una schermata di scelta" → in realtà sono **13**.
- "5 campi obbligatori nel wizard auto" → sono **7, a volte 8**.
- "30-35 KB risparmiati togliendo gli stili scritti a mano" → sono **6-7 KB**.
- "3,3 KB di codice morto in IAM" → sono **4,8 KB** (qui era sottostimato).
- "il rimedio: cancellare la riga 3121" → quella riga contiene **due** variabili, e
  una è viva: cancellarla come scritto rompe la ricevuta dei pagamenti.

### Quante proposte sono cadute

**Cinque proposte non hanno superato la verifica così come erano scritte.**
Lo dico apertamente perché è il dato che serve per fidarsi delle altre.

In tutti e cinque i casi il problema di fondo esisteva davvero: quello che è
caduto sono i numeri o la ricetta, non il fatto. Sono:

1. **Agenda** — il difetto c'è, ma il conteggio "3 clic sbagliati e 3 giusti" non
   era dimostrato, e non era stato visto che la correzione toglie l'inserimento
   appuntamenti a chi non ha il permesso Trattative.
2. **Il modulo ticket morto in IAM** — dichiarate ~64 righe, sono **87**; e due
   funzioni date per vive sono morte anche loro.
3. **`server/assistant.js`** — tutto confermato, ma il blocco da cancellare
   contiene anche il cifratore, non solo il decifratore.
4. **Il segreto TOTP del Pannello Fonti** — confermato e anzi peggiorato: i due
   campi non sono solo doppi, hanno **lo stesso identificativo** nella pagina.
5. **xlsx e mammoth** — i byte erano leggermente sbagliati e mancava un rischio
   (cosa succede se la rete cade dopo che l'utente ha scelto il file).

Una sesta proposta era la stessa cosa detta due volte (la ricerca cliente,
contata una volta 21 copie e una volta 19): le ho fuse in una sola voce.

### Che cosa NON è stato guardato

Questo conta quanto il resto. Nessuna di queste cose è stata verificata, e in
diversi punti sotto la decisione dipende proprio da queste:

- **Il database.** Nessuna interrogazione a Supabase. Non so quanti ticket hanno
  priorità "urgente" e quanti "critica", quante righe ci sono ancora in
  `quote_ticket`, quante anagrafiche hanno un codice fiscale malformato.
- **I registri del server.** Non ho visto quali indirizzi vengono chiamati
  davvero: solo il codice che li chiama.
- **Il VPS.** Non ho guardato `/opt/withus-backend/server/` a confronto con
  quello che c'è nel repository. È la verifica più urgente di tutte (punto 3.11).
- **Come lavorano gli agenti.** Nessun dato d'uso. Dove scrivo "clic risparmiati"
  è aritmetica sul codice, non misura sul campo.
- **L'aspetto delle schermate.** Non è stata aperta nessuna pagina in un browser.
  Tutto è letto dal codice sorgente. Dove una modifica cambia quello che si vede,
  lo scrivo e va guardata con gli occhi prima di pubblicare.
- **Railway** (per un servizio residuo) e **le regole di sicurezza RLS** su Supabase.

---

## 1. Le tre cose che cambierebbero di più la giornata di chi lavora

### Prima di tutto, una cosa che non c'entra con la comodità

Dentro IAM, nel file che il browser scarica per intero **prima ancora del login**,
ci sono sette anagrafiche vere: nome, cognome, numero di polizza, targa,
compagnia. Più quattro nomi di collaboratori nel campo "produttore"
(IAM `index.html:6172-6190`). Sono dentro una funzione che nessuno chiama più —
l'ho cercata in tutto il progetto e compare una volta sola, la sua dichiarazione.

Il file è pubblico su `iam.withusassicurazioni.it` e la schermata di accesso sta
nello stesso file dell'applicazione (`index.html:555`): chiunque, senza entrare,
può leggerli con "visualizza sorgente".

Diciannove righe da cancellare, nessun rischio funzionale. La sola domanda da
farti è: **quei nominativi sono reali o già inventati?** Se sono reali, questa è
la prima cosa da fare oggi. (Nota: cancellarli dal file non li toglie dallo
storico di git.)

### 1) Il menu di QUOTO promette prodotti che poi non apre

Il mega-menu ha 25 voci ma solo 21 destinazioni diverse. Quattro righe portano
tutte allo stesso posto: "RC Auto", "Moto e ciclomotori", "Autocarri" e "Voltura
e recupero classe" finiscono tutte e quattro su `page-rca`
(scocca `withus-one.js:199-202`), che è una schermata che dice "Seleziona la
categoria veicolo" e mostra sette schede da cliccare (QUOTO `index.html:1121-1134`).

Quindi l'agente sceglie "Moto e ciclomotori" dal menu, e la prima cosa che gli
viene chiesta è... di scegliere se è una moto. Un clic di troppo e un momento di
"ho sbagliato strada?".

E non sono quattro le voci fatte così: **sono tredici su venticinque** quelle che
atterrano su una pagina che chiede di scegliere ancora (oltre a `rca` e `impresa`,
anche `cvtard`, `persona`, `vita`, `beni`, `cauzioni`, `cauzioni-appalti`,
`cauzioni-privati`).

Peggio: tre voci nominano prodotti che nel programma non esistono da nessuna
parte. "Multirischio impresa" e "Beni e oggetti di valore" non hanno nessun
riscontro in tutto QUOTO (zero occorrenze), e "Voltura e recupero classe" porta a
una pagina dove quelle parole non compaiono — la voltura in realtà è una scelta
dentro il wizard auto, due schermate più avanti (`index.html:12297`).

E una quarta, "Polizza medici", punta al posto sbagliato: manda su `impresa`,
dove non c'è, mentre il prodotto esiste eccome, in due forme
(`index.html:5337` Aglea Medici e `index.html:6809` RC professionale medici).
**Quella si corregge cambiando una parola in una riga.**

### 2) Le priorità dei ticket si cancellano da sole

QUOTO e IAM usano due vocabolari diversi per la stessa cosa. QUOTO conosce
bassa/normale/alta/**urgente** (QUOTO `index.html:2253`), IAM conosce
bassa/normale/alta/**critica** (IAM `index.html:10798-10803`).

Quando apri da IAM un ticket segnato "urgente", la tendina non ha quella voce:
il browser mostra la prima, cioè "bassa". Se poi salvi qualunque altra modifica,
"bassa" viene scritta nel database (IAM `index.html:11337` e `11343`). La stessa
cosa succede al contrario: un ticket "critica" modificato da QUOTO diventa
"bassa" (QUOTO `index.html:15654` e `15676`).

Non è un fastidio estetico: **è un dato che si perde tutti i giorni**, e si perde
in silenzio. Un ticket urgente diventa un ticket a bassa priorità solo perché
qualcuno l'ha aperto dall'altra applicazione.

(La sezione del ticket invece oggi non si perde: la protegge un pezzo di codice
di ripiego, `withus-ticket-uno.js:166-179`. Ma quel pezzo è destinato a essere
tolto, e allora si romperebbe anche quella. Vedi l'ordine al punto 4.)

### 3) Le voci di menu non dicono dove portano

Tre esempi, tutti verificati.

**"Agenda" non apre l'agenda.** Sia la voce del menu scuro (`withus-one.js:289`)
sia il pulsante del calendario in alto (`withus-one.js:552`) aprono il modulo
"Nuovo appuntamento" (IAM `index.html:5978`, titolo a `index.html:2276`), che è
solo quattro campi da riempire. L'elenco degli appuntamenti sta da un'altra
parte: è una sotto-scheda dentro Trattative (IAM `index.html:978`). E il titolo
in cima alla pagina scrive "Agenda / Agenzia" mentre sotto si vede la Scrivania.

**In Contabilità sei destinazioni hanno due nomi.** Il menu scuro elenca
"Quadratura di giornata", "Anomalie", "Sospesi", "Storico movimenti", "Conto",
"Carica documenti" (`withus-one.js:276-282`); dentro il pannello le stesse sei
cose si chiamano "Quadratura", "Anomalie", "Sospesi", "Storico", "Conto",
"Carica documenti" (IAM `index.html:678-684`). Che siano proprio la stessa cosa è
dimostrato: la voce di menu esegue esattamente il clic sulla scheda
(IAM `index.html:2978-2983`).

**"Estratto conto" compare in tre posti per due cose diverse.** Nel menu scuro
(`withus-one.js:283`) e nel menu utente (IAM `index.html:591`) apre una finestra a
tutto schermo; sulla Scrivania la riga "Chiudi estratto conto"
(IAM `index.html:882`) porta invece alla scheda Conto, che è un'altra cosa. Sulla
stessa Scrivania, la riga sopra dice "Apri pipeline" mentre ovunque altrove quella
schermata si chiama "Trattative".

Bonus non da poco su Contabilità: quelle sei voci del menu scuro **scavalcano i
permessi**. I pulsanti delle schede vengono nascosti a chi non ha il permesso
(IAM `index.html:6310-6313`), ma la funzione che apre il pannello non controlla
niente (IAM `index.html:2851-2855`) e le voci di menu non hanno nessun aggancio ai
permessi. Oggi un collaboratore con `conto:false` può aprire il Conto passando dal
menu scuro.

---

## 2. Snellire l'uso

In ordine di rapporto tra quello che si guadagna e quello che si rischia. Le
prime sono quelle da fare, le ultime quelle da valutare.

### 2.1 "Polizza medici" punta alla pagina sbagliata

La voce manda su `page-impresa`, dove il prodotto non c'è (l'elenco è a QUOTO
`index.html:5623-5627`: RC Attività spenta, Cyber spenta, Rischi Catastrofali,
Fotovoltaico). Il prodotto esiste in due posti: Aglea Medici dentro Salute
(`index.html:5337`, con tariffe e livelli) e il quotatore RC professionale
(`index.html:6809`).

- **Si guadagna:** una voce di menu che porta dove dice. Piccolo ma certo.
- **Si fa:** cambiare `p:'impresa'` in `p:'salute'` (o `'rcprof'`) alla riga
  `withus-one.js:224`. Una parola.
- **Si rischia:** niente, se non che vada scelto quale dei due prodotti è quello
  giusto per il menu. È una tua decisione.
- **Costa:** minuti.

### 2.2 La priorità dei ticket che si riscrive da sola

Descritta al punto 1.2.

- **Si guadagna:** un dato che smette di perdersi. È l'unico difetto di questo
  elenco che oggi **cancella informazione** ogni volta che qualcuno lavora.
- **Si fa:** decidere una parola sola — "urgente" oppure "critica" — e usarla
  dalle due parti. Poi rimappare i ticket già salvati con la parola che sparisce,
  altrimenti si vedranno tutti "Normale" (il ripiego è a QUOTO `index.html:15627`
  e IAM `index.html:10965`).
- **Si rischia:** poco, ma prima serve un conteggio su Supabase: quante righe
  hanno "urgente" e quante "critica". Senza quel numero si sceglie a caso.
- **Costa:** piccolo il codice, il conteggio sul database lo devi fare tu (o
  autorizzarmi a farlo).

### 2.3 Contabilità: sei voci doppie che aggirano i permessi

Descritta al punto 1.3.

- **Si guadagna:** una parola sola per ogni schermata, sei righe in meno nel
  menu, e soprattutto si chiude la scorciatoia che aggira i permessi.
- **Si fa:** togliere le sei sotto-voci dalla tendina Contabilità
  (`withus-one.js:276-280` e `282`), lasciando il capo-menu che apre il pannello.
  In alternativa, se preferisci tenerle, allineare almeno le etichette
  ("Quadratura di giornata" → "Quadratura", "Storico movimenti" → "Storico").
- **Si rischia:** chi si è abituato a saltare da un'altra sezione direttamente a
  "Sospesi" farà due clic diversi (Contabilità, poi la scheda). Non peggiora, ma
  cambia il gesto imparato. **Da non toccare:** gli identificativi `ctab-*` e
  `contab-panel-*`, che sono usati dalla prova
  `verifica/contabilita-una-schermata.test.mjs`.
- **Costa:** piccolo.

### 2.4 "Agenda" apre il modulo, non l'agenda

- **Si guadagna:** il pulsante del calendario in alto passa da un clic che apre
  la cosa sbagliata a un clic che apre l'elenco. E il titolo smette di dire
  "Agenda" mentre si guarda la Scrivania.
- **Si fa:** in `withus-one.js:289` e `:552`, andare su Trattative e poi aprire la
  sotto-scheda agenda, invece di aprire il modulo. Il "+ Nuovo appuntamento" c'è
  già dentro l'agenda (IAM `index.html:1019`), quindi non si perde niente.
- **Si rischia:** due cose vere. Chi usa oggi quel pulsante come scorciatoia per
  *inserire* un appuntamento farà un clic in più. E il pannello Trattative è
  protetto dal permesso `pipeline` (IAM `index.html:6315`): chi non ha quel
  permesso oggi può comunque inserire un appuntamento dal menu, dopo la
  correzione non potrebbe più nemmeno vederli. **Questa la devi decidere tu.**
- **Costa:** piccolo.

### 2.5 Gli importi fra 1.000 e 9.999 euro si scrivono in due modi

IAM scrive `1234,50` dove QUOTO scrive `€ 1.234,50`. Verificato eseguendo il
codice: `fmt(1234.5)` in IAM (`index.html:2815`) dà "1234,50", `soldi(1234.5)` in
QUOTO (`index.html:8679`) dà "€ 1.234,50". Sopra i 10.000 tornano identiche, sotto
i 1.000 pure: **la differenza cade esattamente nella fascia dei premi.**

C'è di peggio, e non era stato notato: dentro IAM ci sono altre **nove**
formattazioni scritte a mano (`index.html:2733, 2817, 3731, 8510, 9297, 9312,
9313, 9324, 9356`), e otto di queste non fissano il numero massimo di decimali —
quindi in certi punti un importo può uscire con **tre** cifre dopo la virgola.
E c'è una differenza di sostanza: in QUOTO un importo che non c'è si scrive "—",
in IAM diventa "€ 0,00" (`index.html:3513`). In contabilità non è la stessa cosa.

- **Si guadagna:** gli importi scritti allo stesso modo ovunque, e i decimali che
  smettono di essere tre.
- **Si fa:** IAM adotta le funzioni di QUOTO, sostituendo il corpo di `fmt` e di
  `oggiEuro` senza toccare le 115 chiamate. Poi vanno sistemati anche `ecEuro`
  (`index.html:7036`) e le nove scritte a mano: sono ~13 punti, non 2.
- **Si rischia:** dove oggi si legge "0,00" comparirà "—". È il comportamento
  giusto, ma cambia a vista in parecchie schermate, e va controllato che nessun
  totale legga il testo formattato per rifarlo numero (`parseNum`,
  IAM `index.html:2821`).
- **Costa:** medio.

### 2.6 Il mega-menu di QUOTO

Descritto al punto 1.1.

- **Si guadagna:** tre voci passano da tre clic a due (RC Auto, Moto, Autocarri).
  Quattro righe ridondanti su 25. Zero righe di codice risparmiate: **il rimedio
  aggiunge codice**, non lo toglie. Il numero che conta è l'altro: 13 voci su 25
  non aprono il prodotto che nominano.
- **Si fa:** far viaggiare anche il tipo di veicolo nel passaggio dalla scocca a
  QUOTO (oggi passano solo `page` e `q`, `withus-one.js:139-144` e QUOTO
  `index.html:2583-2585`) e chiamare direttamente `openAuto(tipo)`, che già
  accetta il tipo (QUOTO `index.html:12261`). Sulle tre voci che nominano prodotti
  inesistenti la decisione è tua: si tolgono o si creano.
- **Si rischia:** tre cose. (a) Scocca e QUOTO vanno pubblicati insieme, altrimenti
  il parametro in più viene ignorato — nessun danno, ma nessun guadagno. (b) Il
  tipo va confrontato con una lista chiusa prima di usarlo, altrimenti finisce un
  valore qualunque dentro i preventivi salvati (`index.html:13565`). (c) Il
  passaggio dal menu funziona solo la prima volta se si tocca una sola strada: il
  ponte ne ha due (`withus-one.js:106-117` per il riquadro già aperto,
  `:139-144` per il primo caricamento). Vanno toccate entrambe.
  **`page-rca` va comunque tenuta:** è l'unico accesso a "Imbarcazioni".
- **Costa:** piccolo, ma con più punti da toccare di quanto sembri.

### 2.7 Nel wizard Auto gli asterischi mentono

Il modello ha **32 campi con l'asterisco** (28 nel caso normale, persona fisica).
I campi che davvero fermano l'utente sono **sette**: cognome, nome, codice fiscale
(`index.html:13524`), data immatricolazione e data acquisto (`:13531`), più
cognome e codice fiscale dell'intestatario quando si toglie la spunta "coincide"
(`:13526-13527`) — cioè in ogni passaggio di proprietà. Più la targa (`:13475`),
che l'asterisco ce l'ha e blocca: otto.

Quindi l'asterisco non significa niente: ce n'è su tutto.

- **Si guadagna:** l'asterisco torna a voler dire "questo serve davvero". Non si
  risparmiano clic, perché oggi nessuno di quei campi obbliga.
- **Si fa:** togliere l'asterisco dai campi che non bloccano, tenendolo sugli
  otto veri. Ma non su tutti: Professione, Stato civile e Anno patente finiscono
  nella richiesta a Prima (`index.html:13243, 13244, 13251`), e senza quelli la
  quotazione esce peggiore. Lì conviene scrivere accanto perché servono, invece
  di togliere il segno.
- **Si rischia:** togliere l'asterisco può far compilare meno spesso i campi che
  alimentano l'anagrafica del cliente — email, cellulare, indirizzo vengono
  salvati in `quote_anagrafiche` (`index.html:13600-13607`) e restano lì anche
  quando la compagnia non li chiede. Renderli bloccanti, invece, ferma agenti che
  oggi passano avanti.
- **Costa:** medio (sono molte righe da toccare, tutte facili).

### 2.8 Cinque campi che nessuno legge

Nel wizard Auto si chiedono: Livello di istruzione, Hai figli?, Tipo di patente,
Mese di conseguimento, Punti patente. Ognuno di questi nomi compare **due volte in
tutto QUOTO**: dove il campo viene disegnato e dove viene salvato nell'oggetto in
memoria. Nient'altro. Non entrano in nessun calcolo di premio, non vanno a Prima
(che invece riceve l'anno patente, `index.html:13251`), non finiscono in
anagrafica (`index.html:13600-13607`).

Restano solo dentro il JSON grezzo del preventivo salvato — che, verificato,
**nessuno rilegge mai**: la funzione che apre un preventivo costruisce quella
stringa e poi non la usa (`index.html:10452`, unica occorrenza).

- **Si guadagna:** cinque caselle in meno da guardare a ogni preventivo auto, e
  il riquadro "Dati patente" che scende da quattro campi a uno. In peso: ~300
  byte su 1,3 MB, cioè niente.
- **Si fa:** togliere le cinque righe del modello (`13720, 13723, 13744, 13745,
  13747`) **e insieme** i cinque nomi dall'elenco di riga `12355`.
- **Si rischia:** due cose. (a) Vanno tolti insieme: se togli il nome dall'elenco
  ma lasci il campo, quel campo si svuota da solo ogni volta che si cambia "Tipo
  di soggetto" (`index.html:12361`). (b) Istruzione e figli **sono fattori
  tariffari classici dell'RC auto**. Non li usa nessuno oggi, ma sono esattamente
  il tipo di dato che una compagnia nuova chiede domani. Se sai di una compagnia
  in arrivo che li vuole, la mossa giusta è l'opposta: usarli.
- **Costa:** piccolo.

### 2.9 "Infortuni conducente" è quattro cose diverse

Lo stesso nome compare in quattro posti con tre significati:

1. una scheda dentro `page-rca`, in mezzo alle categorie di veicolo, che apre il
   wizard auto scrivendo "Infortuni al conducente" **come se fosse un tipo di
   veicolo** (QUOTO `index.html:1132`). Conseguenza: chiede la targa, non
   preseleziona il pacchetto ARD/CVT (`:12265`) e non interroga Prima (`:13214`);
2. una voce di menu che porta a un prodotto diverso, "Protezione Circolare",
   pacchetto fisso da 60 euro (`withus-one.js:209`, QUOTO `index.html:2805`);
3. una garanzia dentro il passo ARD/CVT del wizard auto (`index.html:13986`);
4. una garanzia di Sara Vintage (`index.html:4785`).

Da due menu diversi si finisce quindi su due prodotti dal prezzo diverso.

- **Si guadagna:** una scheda in meno e un bivio in meno. Non quantificabile in
  clic: senza dati d'uso non so quante volte si imbocca quella sbagliata.
- **Si fa:** decidere qual è "il" prodotto da vendere. Il banco di prove ha già
  deciso per conto suo: `ui-test.mjs:1608` associa "Infortuni del conducente" alla
  pagina `page-infcirc`. Se è quello, si toglie la scheda `index.html:1132`. Se
  serve anche la richiesta libera, si rinominano le due voci in modo che si
  distinguano a colpo d'occhio.
- **Si rischia:** se qualcuno oggi usa quella scheda per mandare richieste
  all'ufficio, gli si toglie un percorso. Da chiedere prima. I preventivi già
  salvati con quel valore non si rompono.
- **Costa:** piccolo.

### 2.10 Nessun limite alla dimensione dei file caricati

In tutto QUOTO, 1,3 MB di codice, la dimensione di un file caricato non viene mai
controllata: **zero occorrenze** di `file.size`. Ci sono 22 punti di caricamento
verso lo spazio documenti.

Un filtro sul *tipo* invece esiste già a livello di modulo: 32 campi hanno
`accept="application/pdf,image/*"`. È aggirabile, ma c'è.

- **Si guadagna:** un caricamento da 80 MB smette di partire e di bloccare
  l'agente per minuti. Non quantificabile meglio senza sapere quante volte
  succede.
- **Si fa:** il controllo va messo in un punto solo, quindi conviene farlo
  **insieme** all'unificazione delle funzioni di caricamento (punto 3.13).
- **Si rischia:** **la soglia la devi dare tu.** Non ho un numero da cui partire e
  inventarlo significa bloccare caricamenti oggi validi.
- **Costa:** piccolo se agganciato al 3.13, altrimenti va ripetuto dieci volte.

### 2.11 IAM non controlla i codici fiscali

QUOTO ha il corredo completo: forma, carattere di controllo, gestione
dell'omocodia, e persino il calcolo assistito (QUOTO `index.html:8576-8609` e
`16276-16286`). In IAM di tutto questo non c'è **niente**: zero occorrenze.
Eppure IAM raccoglie e salva codici fiscali dei collaboratori
(IAM `index.html:2012`, salvato a `5434`, mostrato a `4594`).

Attenzione a una trappola: l'altro campo che sembra un codice fiscale,
`az-cf` (IAM `index.html:1833`), è quello **dell'azienda** — sta accanto a
Ragione sociale e P.IVA e il suo segnaposto è undici zeri. Il controllo del
codice fiscale di persona lo boccerebbe sempre. Per quel campo serve il controllo
della partita IVA (QUOTO `index.html:8612`), che c'è già.

- **Si guadagna:** un controllo su un campo che oggi accetta qualunque cosa. Non
  so quanti codici sbagliati ci siano in archivio: andrebbe contato su Supabase.
- **Si fa:** portare le cinque funzioni pure di QUOTO (34 righe) dentro il file
  condiviso che nascerà con la fusione, e chiamarle quando si esce dal campo,
  mostrando il motivo dell'errore e non un generico "non valido".
- **Si rischia:** se in archivio ci sono già schede con codice sbagliato, un
  controllo che **blocca** impedisce di modificare quelle schede per qualunque
  altro motivo. Va introdotto come avviso, non come blocco, finché non dici il
  contrario.
- **Costa:** medio, e conviene farlo dopo la fusione per non copiare codice.

### 2.12 La cattura Allianz ha tre strade, una delle quali contraddice l'avviso antitruffa

Nel pannello Fonti, per Allianz Matrix, ci sono tre pulsanti nello stesso riquadro
(QUOTO `index.html:7896`, `7899`, `7901`): un preferito blu che invia i dati, un
preferito verde che scarica un file, e un pulsante "Copia script" che mette negli
appunti uno script da incollare nella console del browser.

Due righe sopra quel pulsante, il riquadro verde stampa: *"Nessuno di With Us ti
chiederà mai di incollare qualcosa nella console del browser... è un tentativo di
truffa"* (QUOTO `index.html:8247-8248`).

Che sia un residuo lo dice la storia del progetto: il commit `a1e88fd` si chiama
"QUOTO: la cattura API si installa come preferito, non più incollata in console".
Il ripiego di quel pulsante, poi, cerca un elemento della pagina **che non
esiste** (`index.html:8194`, zero occorrenze di quell'identificativo).

- **Si guadagna:** da tre pulsanti a due, e sparisce l'unico punto
  dell'applicazione che invita a maneggiare uno script a mano. In codice: 21
  righe e 3,3 KB.
- **Si fa:** cancellare le righe `7900-7901`, le funzioni `allianzCopiaScript` e
  `allianzInviaCattura` (morta), e la costante dello script che resta senza usi.
- **Si rischia:** restano comunque **due** preferiti, e non fanno la stessa cosa:
  il blu invia direttamente, il verde scarica un file da caricare in chat. Quale
  tenere è una decisione tua. E se un collaboratore oggi usa davvero la via
  console perché su Matrix il preferito non parte, togliendola lo blocchi: da
  chiedere prima.
- **Costa:** piccolo.

### 2.13 Una conferma superflua sui ticket

Salvando la modifica di un ticket da IAM, in un ramo del codice compare una
finestra "Confermi le modifiche al ticket...?" (IAM `index.html:11334`) su
un'operazione che è del tutto reversibile.

- **Si guadagna:** un clic a ogni modifica di ticket.
- **Si fa:** togliere quella conferma.
- **Si rischia:** niente di rilevante, la modifica si può rifare.
- **Costa:** minuti.

### 2.14 Nel pannello "Utenti e permessi" due sezioni restano su "Caricamento..."

Un clic disegna cinque sezioni tutte insieme (IAM `index.html:3040-3048`), e tre
di queste chiedono al database esattamente la stessa cosa. Ma solo per
l'amministratore: per un **operatore**, che pure ha accesso al pannello
(IAM `index.html:6236`), due delle funzioni escono subito (`:9969` e `:9159`) e i
due riquadri "Pannello Controllo KPI" e "Obiettivi operatori" restano per sempre
sulla scritta "Caricamento...". Sembrano rotti.

- **Si guadagna:** due sezioni che smettono di sembrare guaste; e per te, che sei
  amministratore, due interrogazioni al database in meno per apertura.
- **Si fa:** trasformare le cinque sezioni in cinque sotto-schede, usando la
  barra già presente altrove nel file (IAM `index.html:1821-1823`,
  con il selettore `index.html:2846-2859` che fa già esattamente "disegna solo la
  scheda aperta").
- **Si rischia:** chi oggi scorre la pagina e vede tutto insieme dovrà cambiare
  abitudine, e il "Log modifiche" finirebbe dietro un clic. Cambia il modo di
  lavorare di un amministratore: va guardato prima. **Non fare** la memoria breve
  sull'elenco utenti che sembrerebbe ovvia: quell'elenco viene sovrascritto da
  un'altra schermata con solo tre colonne (IAM `index.html:5779-5782`), e una
  memoria ingenua farebbe apparire caselle vuote.
- **Costa:** medio.

### 2.15 La ricerca cliente non cerca le stesse cose in tutti i moduli

Nei 19 riquadri "cerca cliente" ci sono tre insiemi di campi diversi: sette
cercano solo nominativo e codice fiscale, nove aggiungono la partita IVA, tre
aggiungono telefono e cellulare. Nessuno cerca in tutti e cinque.

**Ma questa non è una dimenticanza**, e va detto perché la prima lettura diceva
il contrario: ho controllato i segnaposto dei campi e corrispondono esattamente.
Dove si cerca la P.IVA il campo dice "Nominativo, codice fiscale, P.IVA…"; dove
non si cerca, non lo dice. Sono tutti prodotti per privati. È una scelta di
perimetro, non un errore.

- **Si guadagna:** se decidi di cercare sempre in tutti i campi, la ricerca per
  telefono passa da 3 riquadri su 19 a 19 su 19. Ma è un **cambio di perimetro
  commerciale**, deciso da te, non una correzione.
- **Si fa:** insieme all'unificazione tecnica del punto 3.14, che va fatta
  comunque.
- **Si rischia:** i risultati mostrati sono al massimo sei (limite fisso in tutte
  e 19). Una ricerca più larga può spingere fuori dai sei il cliente che prima si
  vedeva. Se si allarga, va rivisto anche quel sei.
- **Costa:** nullo se agganciato al 3.14.

### 2.16 Le sette schede "In arrivo"

Nel catalogo prodotti ci sono 45 schede disegnate, di cui sette spente. Non sono
una trappola: sono già sbiadite al 55%, senza cursore a mano e con l'etichetta
"In arrivo" (QUOTO `index.html:158-166`). Quello che manca è solo il blocco fisico
del clic, che oggi porta a una schermata "In sviluppo".

- **Si guadagna:** poco o niente per chi lavora. L'unica decisione vera è
  commerciale: quelle schede sono una vetrina davanti al cliente o sono rumore?
- **Si fa:** o si lasciano, o si tolgono. Se si lasciano, basta bloccare il clic.
- **Si rischia:** toglierle senza chiedere è un danno se servivano da vetrina.
- **Costa:** minimo.

### 2.17 Il pannello Fonti chiede un segreto che non serve a niente

Il Pannello Fonti chiede il "SEGRETO TOTP" e promette che *"lo scraper genererà il
codice da solo ad ogni accesso"*. Non lo fa: la funzione che lo genererebbe esiste
(scraper `allianz/quote-service.mjs:67`) ma **non è mai chiamata da nessuna parte**
(una sola occorrenza in tutti e due i repository, la sua dichiarazione). Il
segreto viene raccolto, cifrato, salvato e trasportato fino allo scraper, e lì si
ferma. Quello che il login usa davvero è un altro campo.

In più i due campi che lo chiedono sono nella stessa funzione
(QUOTO `index.html:7831` e `7911`) e hanno **lo stesso identificativo**: per una
fonte personalizzata con doppia autenticazione vengono disegnati tutti e due, e il
programma legge sempre solo il primo. Ed esiste uno stato "totp_rifiutato"
(`index.html:8343`) che nessuno emette mai.

- **Si guadagna:** un campo in meno che promette una cosa falsa, e un difetto di
  identificativo doppio che sparisce. ~35 righe.
- **Si fa:** **decisione tua**, e sono due strade opposte. (a) Se i portali che
  usi hanno un passcode e non un codice da app, si toglie tutto. (b) Se invece
  serve, si collega davvero: sono due righe.
- **Si rischia:** nella strada (a), cancellare un segreto già salvato: va
  guardato prima se qualche fonte ne ha uno. Nella strada (b) si tocca il login,
  che è materia da non toccare senza motivo.
- **Costa:** piccolo, ma è bloccata da una tua risposta: *i portali che usi hanno
  un codice da app (tipo Google Authenticator) o un passcode tipo Duo?*

---

## 3. Snellire il codice

Sempre in ordine di rapporto tra guadagno e rischio. Il peso in byte quasi mai
conta: QUOTO è 1,3 MB e IAM 736 KB, e togliere 5 KB non si vede. Dove il guadagno
è solo di manutenzione lo scrivo.

### 3.1 I dati veri dentro IAM

Vedi il punto 1. **19 righe, 1.642 byte** (IAM `index.html:6172-6190`).

- **Si guadagna:** i dati smettono di essere leggibili senza accesso. Il peso è
  irrilevante.
- **Si fa:** cancellare le righe. Se serve un modo per provare l'applicazione a
  vuoto, rifarlo con nomi di fantasia e polizze a zeri.
- **Si rischia:** niente sul funzionamento (nessun chiamante in tutto il
  progetto). Restano nella cronologia di git, che è pubblica se il repository lo è.
- **Costa:** minuti.

### 3.2 Nove funzioni morte in IAM, più una finestra irraggiungibile

Su 481 funzioni dichiarate in IAM, nove non sono chiamate da nessuna parte —
verificato anche dentro gli `onclick=` dell'HTML, e cercando le chiamate fatte per
nome (che in IAM esistono, ma riguardano altre cinque funzioni, tutte vive).

Sono: `buildGauge` (`9640`), `calcPerf` (`4509`), `cambiaRuolo` (`6838`),
`exportICS` (`6045`), `inviaTicket` (`11037`), `openSettings` (`3071`),
`renderHDI` (`9655`, già marcata "obsoleto" dall'autore), `showDashContent`
(`3821`), `toggleAbb` (`4238`).

Conseguenza a catena: `openSettings` era l'unico punto che apriva la finestra
"Widget Dashboard" (IAM `index.html:619-628`), che quindi **non è più apribile** —
e del resto il suo contenuto dice già che i widget si configurano dal profilo.

- **Si guadagna:** 85 righe e 4,8 KB (0,65% del file). Nove nomi in meno da
  leggere. Guadagno di leggibilità, non di peso.
- **Si fa:** cancellare a blocchi, **dal fondo verso l'alto** per non spostare i
  numeri di riga, rilanciando `node controlla-tutto.mjs` fra un blocco e l'altro.
  Attenzione al riquadro: va da `619` a `628`, non `618-627` come si potrebbe
  contare a occhio — sbagliando si lascia un `</div>` orfano e si rompe la pagina.
- **Si rischia:** due meritano una domanda prima. `cambiaRuolo` sa cambiare il
  ruolo di un utente e proteggere il Super Admin: se è morta perché quella cosa
  oggi si fa altrove, si cancella; se è morta perché qualcuno ha tolto per sbaglio
  il pulsante, allora **manca una funzione all'applicazione**. Stessa domanda per
  `exportICS`, che esporta un appuntamento nel calendario. Le altre sette sono
  residui senza dubbio.
- **Costa:** piccolo.

### 3.3 La schermata di lancio di QUOTO dentro IAM

Quando la scocca è caricata, riscrive la navigazione (`withus-one.js:757-762`) e
intercetta il passaggio a QUOTO prima che arrivi al vecchio codice. Risultato: il
ramo dentro IAM (`index.html:3011-3037`), il pannello di passaggio
(`index.html:1767-1817`) e le sue quattro animazioni (`index.html:442-457`) non
producono più un pixel. È voluto: lo dice esplicitamente una prova del banco
(`verifica/scocca-tre-barre.test.mjs:68-75`).

- **Si guadagna:** 94 righe e 8.482 byte scaricati a ogni visita e mai usati.
- **Si fa:** cancellare quei tre pezzi. Attenzione: il pannello finisce a riga
  **1817**, non 1819 — cancellando fino a 1819 si porta via anche il commento
  della sezione successiva.
- **Si rischia:** uno vero ma remoto. Se un giorno la scocca non si caricasse,
  oggi quel ramo è la via di riserva verso il preventivatore; cancellandolo,
  "quoto" diventerebbe una scheda senza pannello. Se vuoi tenere la rete, si
  cancellano solo le animazioni e il ramo, lasciando il pannello. **Non toccare
  `apriQuoto()`** (`index.html:2909`): quella è viva e ha due chiamanti
  (`index.html:2391` e `3523`).
- **Costa:** piccolo.

### 3.4 Il blocco "emissione diretta RC Vita Privata" in QUOTO

Dodici funzioni che si chiamano soltanto fra loro, e la prima della catena non è
chiamata da nessuno: **189 righe, 18,5 KB** irraggiungibili
(QUOTO `index.html:3095-3399`, a blocchi).

- **Si guadagna:** 1,4% del file. Il valore vero è igienico: sparisce un
  simulatore di pagamento finto ("Simulare un pagamento riuscito per test?").
- **Si fa:** cancellare i dodici blocchi nominati. **Nell'intervallo ci sono anche
  funzioni vive che non vanno toccate** (le funzioni dei pagamenti, il documento
  d'identità in anagrafica): si rimuovono le dodici, non l'intervallo.
- **Si rischia:** un errore già individuato: la riga `3121` contiene **due**
  variabili sulla stessa riga, e la seconda è viva in cinque punti, uno dei quali
  nella ricevuta dei pagamenti. Va tolta solo la prima. E siccome tocca il
  perimetro "pagamenti", serve il tuo via libera. Domanda: *l'emissione diretta di
  RC Vita Privata era una cosa che volevi, o un esperimento abbandonato?*
- **Costa:** piccolo.

### 3.5 Otto funzioni morte in QUOTO

Cercate una per una su tutto il repository: una sola occorrenza ciascuna, la
dichiarazione. Sono `allianzInviaCattura` (`8260`), `importaAgleaSalus` (`17080`),
`inviaCodice` (`8307`), `paypPayOnline` (`11337`), `tutelaSelect` (`8955`),
`rcvpRDpayOnline` (`3326`), `czToggleAltriBenef` (`15372`, corpo letteralmente
vuoto) e `isSuperAdmin` (`2262`).

- **Si guadagna:** 52 righe, 3,5 KB. Lo 0,27% del file: trascurabile.
- **Si fa:** cancellare i blocchi.
- **Si rischia:** **tre vanno autorizzate da te, non le tocco**. `isSuperAdmin` è
  un controllo di permessi; `paypPayOnline` e `rcvpRDpayOnline` sono codice di
  pagamento, e il progetto dice di non toccare login e pagamenti. Nota importante:
  togliere `isSuperAdmin` **non** toglie il residuo — la tua email resta scritta
  nella costante di riga `2261`, usata viva in quattro punti, di cui uno che
  promuove ad amministratore. E `importaAgleaSalus` potrebbe essere una funzione
  appena scritta e non ancora collegata a un pulsante: da confermare prima di
  buttarla.
- **Costa:** piccolo.

### 3.6 Il modulo ticket morto in IAM

Metà del modulo ticket di IAM disegna dentro elementi che nella pagina non
esistono più. La funzione che disegna l'elenco esce alla prima riga perché cerca
un contenitore assente; la funzione che invia legge quattro campi che non ci
sono; e con loro sono irraggiungibili anche "Prendi in carico", "Segna risolto" ed
"Elimina", perché gli unici pulsanti che li chiamavano stavano dentro l'elenco
morto. **87 righe, 4.819 byte** (IAM `index.html:10900-10955`, `11037-11044`,
`11046-11069`). Lo dice anche un commento già scritto nel codice
(`withus-ticket-uno.js:102-104`).

- **Si guadagna:** 87 righe. Sullo 0,65% del file: il valore è la leggibilità.
- **Si fa:** togliere le funzioni e **insieme** le due chiamate rimaste
  (IAM `index.html:10849` e `withus-ticket-uno.js:263`), altrimenti si ottiene un
  errore che rompe il caricamento dei ticket.
- **Si rischia:** basso ma non nullo. Togliendole, IAM resta senza "Prendi in
  carico", "Segna risolto" rapido ed "Elimina". Oggi quei tre pulsanti già non si
  vedono — ma se tu pensavi che ci fossero, la domanda giusta è "li rimettiamo?"
  prima di "li cancelliamo?".
- **Costa:** piccolo.

### 3.7 `server/assistant.js`: 124 righe mai collegate

Non è importato da nessuna parte, nessuno lo chiama, e **non partirebbe nemmeno
se lo montassi**: importa una libreria che non è dichiarata fra le dipendenze del
backend. La storia lo conferma: il commit che lo ha creato si chiama "Assistente
AI interno: modulo backend (dormiente, non ancora collegato)", e non è mai stato
montato in nessuna versione. Strascico: il salvataggio giornaliero
(`server/backup.js:72`) mette ancora nella lista un file che solo quel modulo
scriverebbe, e che infatti non esiste.

(La chat di IAM esiste ma non passa di qui: chiama direttamente un altro
fornitore, IAM `index.html:6078`.)

- **Si guadagna:** 124 righe, 7.342 byte. Un modulo in meno da chiedersi cos'è.
- **Si fa:** cancellare il file e togliere quella voce dalla lista dei salvataggi.
- **Si rischia:** nullo sul funzionamento. L'unica domanda è tua: *è un progetto
  sospeso o abbandonato?* Se sospeso, si archivia invece di cancellare (resta
  comunque recuperabile da git).
- **Costa:** minuti.

### 3.8 `scraper/server.js`: 44 righe che non possono girare

Importa cinque file che non esistono. Provato davvero: il caricamento fallisce.
Nessun servizio lo avvia (i tre servizi di sistema puntano ognuno al proprio
`quote-service.mjs`).

- **Si guadagna:** 44 righe, e soprattutto una cartella `scraper/` che si capisce
  a colpo d'occhio.
- **Si fa:** cancellare il file.
- **Si rischia:** nullo. **Ma non cancellare anche `scraper/health.js`**, che
  sembra un gemello: quello è ciò che esegue `npm start` alla radice del
  repository (`package.json:6`). Se lo togli, `npm start` si rompe.
- **Costa:** minuti.

### 3.9 QUOTO scarica ApexCharts a ogni apertura per un grafico solo

Il grafico serve unicamente nella schermata Performance, che per giunta ha la
voce di menu nascosta di default (QUOTO `index.html:1023`). La libreria viene
scaricata sempre, e in modo bloccante (`index.html:55`, senza `defer` né `async`).

Misurato: **230.722 byte compressi** (829.675 non compressi), cioè il 15,3% di
quello che si scarica alla prima apertura.

- **Si guadagna:** 230 KB compressi risparmiati a chiunque non entri in
  Performance, cioè quasi tutti. E uno script bloccante in meno in testa alla
  pagina.
- **Si fa:** togliere la riga 55 e caricare la libreria quando si apre
  Performance, con una decina di righe. Nessuno strumento nuovo, nessuna
  compilazione. Fissare anche la versione (oggi l'indirizzo non la dice e serve la
  6.6.1).
- **Si rischia:** oggi c'è una guardia che fa uscire la funzione in silenzio se la
  libreria manca (`index.html:12103`): va sostituita con un messaggio, altrimenti
  se il caricamento fallisce l'utente vede un riquadro vuoto senza capire perché.
  Le 157 prove restano verdi (il banco sostituisce già la libreria con un finto).
- **Costa:** piccolo.

### 3.10 IAM scarica 1,5 MB di librerie che servono solo dopo aver scelto un file

Due librerie per leggere Excel e Word vengono scaricate a ogni apertura
(IAM `index.html:12` e `13`, anche queste bloccanti). Servono solo dentro quattro
funzioni, e a quelle funzioni si arriva solo da quattro campi "scegli file"
(IAM `index.html:702, 703, 820, 830`). La libreria Word ha **un solo** punto d'uso.

Misurato: **452.751 byte compressi**, cioè il 28,6% della prima apertura di IAM.

- **Si guadagna:** 452 KB compressi a ogni apertura per chi non carica file, cioè
  la maggior parte delle aperture.
- **Si fa:** togliere le due righe e caricare la libreria su richiesta, dentro le
  tre funzioni di caricamento (e quella di Word solo nel ramo `.docx`).
- **Si rischia:** i tre gestori diventano asincroni. Se la rete è lenta o cade
  fra la scelta del file e la lettura, il file non viene letto: serve un messaggio
  visibile ("preparo il lettore dei file Excel...") e un errore chiaro se
  fallisce, altrimenti l'utente crede che il caricamento sia riuscito. Da
  riprovare con `controlla-tutto.mjs`.
- **Costa:** medio.

### 3.11 Il frontend chiama almeno 28 indirizzi che nel backend non esistono

Questa non è una pulizia: **è una verifica da fare prima di tutto il resto.**

QUOTO chiama indirizzi come `/moto/ania`, `/moto/hub-auto`, `/moto/premio` e sei
coppie per compagnia (`/moto/preventivo24`, `/preventivoHDI`, `/preventivoAxa`…);
IAM ne chiama altri. Nel backend che sta nel repository quegli indirizzi **non
esistono**: `server/moto.js` ne dichiara due in tutto. Ho controllato anche le
altre quattro basi di codice presenti in QUOTE (`api/`, `routes/`, `services/`,
`backend/`): zero riscontri.

Delle due l'una:

- oppure il VPS ha file che nel repository non ci sono — e allora il problema è
  serio, perché lo script di pubblicazione ripubblica dal repository e **ogni
  pubblicazione cancella codice funzionante in produzione**;
- oppure quelle chiamate rispondono "non trovato" e i pezzi di interfaccia
  corrispondenti vanno finiti o tolti.

- **Si guadagna:** sapere quale delle due. Non quantificabile, e non ha senso
  quantificarlo.
- **Si fa:** trenta secondi sul VPS: elencare `/opt/withus-backend/server/` e
  confrontarlo con l'elenco dei file tracciati da git.
- **Si rischia:** fare la cosa sbagliata per fretta. Cancellare l'interfaccia se
  il backend esiste davvero significa buttare lavoro funzionante.
- **Costa:** minuti, ma **prima di qualunque altra cosa nel backend**.

### 3.12 Rotte del backend che nessuno chiama

Otto indirizzi non vengono chiamati da nessun frontend, cercati sia scritti per
intero sia costruiti a pezzi. Quattro sono innocui e piccoli
(`/sign/status`, `/sign/privacy/status`, `/mail/folders`, `GET /shop/bonifico`);
uno non può proprio funzionare (`/fonti/:id/preventivo`, `server/fonti.js:174`:
inoltra a un indirizzo che lo scraper Italiana non conosce).

- **Si guadagna:** ~42 righe sicure, su un totale di ~122. Poco.
- **Si fa:** togliere le cinque sicure.
- **Si rischia:** "nessun frontend la chiama" non è "nessuno la chiama". Queste
  possono essere usate a mano dal terminale del VPS. In particolare
  `/backup/status` e `/backup/run` sono esattamente il tipo di cosa che si lancia
  a mano — e `POST /moto/lookup` va lasciata dov'è finché il punto 3.11 non è
  chiarito, perché è **l'unica** interrogazione targa presente nel repository.
  **Da tenere:** `/mail/selftest`, che è un collaudo dichiarato e serve quando la
  posta non va.
- **Costa:** piccolo, ma dopo il 3.11.

### 3.13 Il caricamento documenti è lo stesso stampo copiato dieci volte

Dieci funzioni identiche riga per riga a meno di quattro sostituzioni (il prefisso
degli identificativi, la cartella di destinazione e due nomi di variabile). Sono
**129 righe / 10.753 byte**, e diventerebbero una funzione da ~16 righe più dieci
chiamate da una riga: **~103 righe risparmiate**.

La deriva da copia-incolla è dimostrata: nove scrivono "✓ Caricato" e due
scrivono "Caricato" senza la spunta. Nel file ci sono in tutto 18 funzioni di
caricamento e 22 punti che caricano davvero: il perimetro è più largo di dieci,
ma dieci sono quelle che si fondono senza pensarci.

- **Si guadagna:** ~103 righe, ~8,5 KB (0,6% del file). Il vero guadagno è che
  l'esito a schermo torna a essere scritto in un modo solo, e che **il limite di
  dimensione del punto 2.10 si aggiunge in un posto solo**.
- **Si fa:** una funzione condivisa con quattro parametri, e dieci chiamate al suo
  posto.
- **Si rischia:** due funzioni **non** vanno messe nello stampo. Quella delle
  cauzioni (`index.html:14999`) differisce in cinque punti sostanziali, fra cui
  che non aggiorna il documento d'identità in anagrafica: accorparla
  aggiungerebbe una scrittura che oggi non avviene. E quella dei sinistri
  (`index.html:11804`) ha proprio un contratto diverso (più file, restituisce un
  elenco). **Le cartelle di destinazione vanno copiate dalle stringhe esistenti,
  mai riscritte a memoria**, altrimenti i documenti già caricati non si ritrovano.
  Il banco di prove non copre nessuna di queste funzioni: la verifica va fatta a
  mano su almeno tre moduli.
- **Costa:** medio.

### 3.14 La ricerca cliente è copiata diciannove volte

Diciannove funzioni identiche nella struttura: stessa tabella, stesso limite di
sei risultati, stessa attesa di 300 millesimi, stessa soglia di due caratteri.
Con le diciannove gemelle che riempiono il modulo dopo la scelta, sono **circa
418 righe / 27,7 KB**, cioè il 2,1% del file.

- **Si guadagna:** circa 315 righe e ~22 KB. È la duplicazione più grossa di
  tutte.
- **Si fa:** una funzione di ricerca condivisa più una tabella con le 19 voci.
  Attenzione: le funzioni che riempiono il modulo **non** differiscono solo per
  prefisso, ma per mappa dei campi — serve passare una mappa, non una sigla.
- **Si rischia:** due cose serie. (a) **Il banco di prove non tocca nessuna di
  queste 19 funzioni** (zero riscontri in `ui-test.mjs`): se il rifacimento rompe
  qualcosa, il banco resta verde e non te ne accorgi. Va fatto **un modulo alla
  volta**, provando a mano. Non è prudenza generica: è l'unica rete che c'è.
  (b) Due identificativi sono duplicati nella pagina (`rcp-search` compare quattro
  volte, `fi-search` due): una riscrittura basata sul prefisso ci sbatte contro.
- **Costa:** grande.

### 3.15 Le due interrogazioni al database che partono prima del login

All'apertura di IAM partono due interrogazioni a Supabase
(IAM `index.html:11670` e `11672`), e partono **mentre è ancora visibile la
schermata di accesso**, prima di sapere chi sta guardando. Una delle due scarica
l'intero elenco dei movimenti bancari di entrambi i conti.

Le stesse due funzioni vengono già richiamate quando si apre la sezione
corrispondente (`index.html:3008` e `2858`).

- **Si guadagna:** una interrogazione in meno per chi entra, due per chi si ferma
  alla schermata di accesso — e la seconda è quella pesante. Il guadagno vero è di
  correttezza: si smette di chiedere i movimenti bancari prima del login.
- **Si fa:** togliere la prima riga (i dati azienda: nessuno li legge prima di
  entrare in quella sezione, verificato) e **spostare** la seconda dentro la
  funzione che si esegue dopo il login.
- **Si rischia:** **non cancellarla**. I movimenti alimentano anche il cruscotto
  (`index.html:3482` e `3655`): se resta solo la copia locale, un bonifico spuntato
  da un altro computer continua a comparire come da spuntare.
- **Costa:** piccolo.

### 3.16 Il carattere in più caricato da Google per due scritte decorative

IAM carica una seconda famiglia di caratteri (IAM `index.html:19`) usata in tre
regole, di cui una è **codice morto dimostrato** (`.ir-title`, riga 168: una sola
occorrenza in tutto il progetto, la sua definizione).

- **Si guadagna:** 7.842 byte e due richieste in meno. Circa lo 0,5% della prima
  apertura: **è il più piccolo di questo elenco**. Nessuna connessione
  risparmiata, perché l'altro carattere viene dallo stesso posto.
- **Si fa:** usare un carattere a spaziatura fissa già presente su ogni
  dispositivo, e cancellare la regola morta.
- **Si rischia:** le due scritte decorative cambiano larghezza, e cambiano in
  modo diverso su Mac, Windows e Android. Una è a 7 pixel dentro l'intestazione:
  va guardata con gli occhi che non vada a capo.
- **Costa:** minuti. Se hai un'ora sola, non spenderla qui.

### 3.17 Otto funzioni di smistamento quasi identiche

Otto funzioni con lo stesso preambolo di cinque righe ripetuto (QUOTO
`index.html:2620, 2819, 5637, 6149, 6501, 7600, 7632, 7658`), 89 righe in tutto.
Tre di queste hanno per corpo tredici righe che sono dati travestiti da codice.

Per strada è saltato fuori un difetto latente: due delle otto non hanno la riga
di ripiego che hanno le altre sei. Oggi non fa danno (verificato: nessun clic ci
cade), ma è una trappola per domani.

- **Si guadagna:** ~45-50 righe e ~2 KB. Modesto.
- **Si fa:** una funzione sola che fa il preambolo, e le etichette spostate nella
  tabella dei prodotti.
- **Si rischia:** i nomi delle otto funzioni compaiono negli `onclick` generati:
  vanno cambiati insieme, altrimenti restano pulsanti che chiamano funzioni
  sparite. E gli otto elenchi non hanno campi identici: va fatto un elenco alla
  volta.
- **Costa:** medio.

### 3.18 Il modulo ticket scritto due volte

Ticket è scritto due volte sopra la stessa tabella: 130 righe in QUOTO e ~313 in
IAM. Tolte le 87 righe morte già contate al 3.6, la duplicazione viva è **~356
righe**.

- **Si guadagna:** stima onesta **120-160 righe**, non di più. Perché ~130 righe
  di IAM sono funzioni che QUOTO non ha (il contatore sul pulsante, l'elenco in
  scrivania, gli errori mostrati in pagina) e nell'unione **vanno tenute**, non
  tolte.
- **Si fa:** un file solo, caricato dai due lati, con la lettura, la scrittura e
  le costanti. La colonna "origine", che già esiste e nessuno legge, diventa il
  modo di etichettare la riga.
- **Si rischia:** unificare il disegno a schermo significa che una delle due
  facce cambia aspetto per chi la usa ogni giorno: **è una decisione di prodotto,
  non di codice.** E il filtro di chi vede quali ticket non è identico nei due
  (QUOTO e IAM leggono il ruolo da due posti diversi): unificando bisogna tenere
  la stessa regola, o cambia chi vede cosa. Le regole di sicurezza lato Supabase
  non sono state guardate.
- **Costa:** grande.

### 3.19 `withus-ticket-uno.js`: un cerotto messo prima della cura

Questo file (11.932 byte, IAM `index.html:11738`) è nato il 29 luglio per unire le
due code di ticket. Il 30 luglio un altro intervento ha risolto il problema alla
radice, spostando tutti i ticket in una tabella sola. Il cerotto è rimasto.

C'è un sospetto concreto, che non ho potuto verificare perché non tocco il
database: lo script di migrazione dice esplicitamente che la vecchia tabella
**non viene cancellata**. Se è così, quei ticket stanno ora in tutte e due le
tabelle, e questo file li ripesca e li **aggiunge** all'elenco: ogni vecchio
ticket di QUOTO comparirebbe **due volte** nella scrivania.

- **Si guadagna:** 11.932 byte per apertura e una interrogazione in meno per ogni
  caricamento dei ticket. Ma il guadagno vero, se il sospetto è confermato, è
  l'elenco che smette di mostrare doppioni.
- **Si fa:** togliere il tag `<script>` e cancellare il file. È scritto apposta
  per essere reversibile.
- **Si rischia:** **ordine obbligato.** Quel file non fa solo un'etichetta: è lui
  che oggi impedisce alla *sezione* del ticket di essere sovrascritta
  (`withus-ticket-uno.js:166-179`). Toglierlo prima di aver unificato le liste
  (punto 2.2) riapre un difetto uguale a quello della priorità. E se in quella
  vecchia tabella qualcuno ha aperto ticket dopo il 30 luglio, togliendolo
  spariscono dalla vista. Va contato prima su Supabase.
- **Costa:** piccolo il lavoro, ma va **dopo** il 2.2.

### 3.20 `esc` scritta due volte in IAM

Due funzioni identiche con nomi diversi (IAM `index.html:8615` e `10811-10815`):
una usata 139 volte, l'altra 12.

- **Si guadagna:** **5 righe.** Praticamente niente, e lo dico apertamente.
- **Si fa:** tenere quella con 139 usi e sostituire le 12 chiamate.
- **Si rischia:** niente.
- **Costa:** minuti. **Ma il vero problema è un altro, ed è più serio:** cercando
  dove quella funzione *non* viene usata, è saltato fuori che IAM
  `index.html:4594` stampa il codice fiscale di un collaboratore nella pagina
  senza passare da nessuna delle due. Il difetto di IAM non è avere due nomi: è
  che in qualche punto il testo che arriva dal database non passa da nessuno dei
  due. **Se hai un'ora, spendila su quella riga, non su questa voce.**

### 3.21 Gli scraper Allianz e Italiana condividono ~90 righe

98 righe identiche fra i due file (misurate col confronto automatico). Il terzo
scraper, Moto, **non** è un gemello: portale diverso, flusso diverso.

- **Si guadagna:** ~90 righe tolte da uno dei due file, ma ~100 aggiunte in una
  cartella condivisa: **il totale di righe non cala, si sposta.** Il guadagno è
  solo di manutenzione, ed è reale: oggi una correzione al login va fatta due
  volte.
- **Si fa:** allargare la cartella comune (dove c'è già il freno) con i segreti,
  gli aiuti sulla pagina e l'accesso. Le differenze vere si passano come
  parametro.
- **Si rischia:** **alto e concreto.** La prova `scraper-freno.test.mjs` non
  esegue gli scraper: **legge i sorgenti**, e pretende di trovare certe funzioni
  dentro il file di ogni compagnia. Spostandole, quattro prove su tredici
  diventano rosse anche se tutto funziona — e quella è la rete che impedisce il
  ritorno del ciclo infinito di login. Va aggiornata la prova insieme allo
  spostamento. Inoltre i moduli nuovi devono restare senza dipendenze esterne,
  come già il freno.
- **Costa:** medio, ma con una trappola.

### 3.22 Gli stili scritti dentro i tag

1.494 attributi di stile scritti a mano in QUOTO, per 86.198 byte. I valori che si
ripetono tre o più volte sono 99, per 844 occorrenze.

- **Si guadagna:** molto meno di quanto sembra. Convertendo i 10-15 valori più
  ripetuti: **circa 6-7 KB** sul file grezzo e ~2 KB su quello che l'utente
  scarica davvero. Convertendoli tutti e 99: 28,5 KB grezzi, ~5-6 KB scaricati.
  Sotto il 2%.
- **Si fa:** una manciata di classi nel foglio di stile già presente, e
  sostituzione di testo. Nessuno strumento nuovo. **Ma il caso numero uno non si
  risolve così:** il valore più ripetuto (71 volte) sta sempre sulla stessa
  classe, che nel foglio di stile **dichiara già metà di quel valore**
  (`index.html:881`). Lì non serve una classe nuova: serve decidere il colore in
  un punto solo.
- **Si rischia:** è **il rapporto guadagno/rischio peggiore di tutto il
  documento**, e per questo è ultimo. La sostituzione cieca è pericolosa:
  `display:none` compare 39 volte e in diversi casi viene cambiato dal programma
  a runtime; trasformarlo in classe cambia chi vince. Inoltre, correggendo la
  regola di riga 881 si ricolorerebbero di blu 17 intestazioni oggi grigie: è una
  modifica visibile, va guardata prima.
- **Costa:** grande.

### 3.23 Un meccanismo spento e un commento che dice il falso

Nel wizard Auto c'è un meccanismo per saltare dei passi che è **vuoto da sempre**
e non può riempirsi (QUOTO `index.html:12210`). Il commento sopra afferma che due
passi vengono saltati in automatico: non è vero, si attraversano tutti e sette.

- **Si guadagna:** 4-6 righe. Il valore è il commento che smette di mandare fuori
  strada chi legge il codice: non si misura in righe.
- **Si fa:** o si cancella il meccanismo e si corregge il commento, o — se il
  salto passi serve davvero — lo si accende. Quale passo saltare e quando è una
  decisione tua.
- **Si rischia:** **non cancellare le due regole di stile collegate**
  (`index.html:872-873`): quelle sono vive, le usa il wizard Cauzioni, dove il
  salto è acceso davvero (`index.html:14922` e `15028-15030`). Cancellarle spegne
  la grigiatura di due passi in una schermata che usate.
- **Costa:** piccolo. La via più prudente è correggere solo il commento.

---

## 4. L'ordine consigliato

Il lavoro grosso già deciso è portare QUOTO dentro IAM. Questo cambia l'ordine:
alcune cose vanno fatte **prima** perché la fusione le renderebbe più difficili,
altre vanno fatte **dentro** la fusione perché farle ora significa farle due
volte.

### Blocco 0 — oggi, meno di un'ora, rischio nullo

1. **Cancellare i dati veri da IAM** (3.1). Se quei nominativi sono reali, viene
   prima di tutto.
2. **Guardare il VPS** (3.11): elencare i file del backend e confrontarli col
   repository. Trenta secondi che decidono se c'è un problema serio o no. Finché
   non è fatto, **non toccare niente in `server/`**.
3. **Ripuntare "Polizza medici"** (2.1): una parola.
4. **Cancellare la regola di stile morta** in IAM (3.16, riga 168).

### Blocco 1 — codice morto, una mattinata, rischio nullo o quasi

Nessuna di queste tocca cosa si vede a schermo. Va fatto **prima della fusione**,
perché ogni riga morta è una riga che altrimenti va portata dall'altra parte e
riletta lì.

5. `server/assistant.js` e `scraper/server.js` (3.7, 3.8).
6. Le nove funzioni morte in IAM e la finestra irraggiungibile (3.2).
7. La schermata di lancio di QUOTO dentro IAM (3.3).
8. Il modulo ticket morto in IAM (3.6).
9. Il blocco "emissione diretta RCVP" in QUOTO (3.4) — **con il tuo via libera**,
   perché sfiora i pagamenti.
10. Le otto funzioni morte in QUOTO (3.5) — le cinque innocue subito, le tre di
    permessi e pagamenti solo con il tuo via libera.

Dopo ognuna: `node controlla-tutto.mjs` per IAM, `node ui-test.mjs` per QUOTO (con
`npx http-server -p 8077` acceso).

### Blocco 2 — velocità, mezza giornata

Questi guadagni si perdono nella fusione se non si fanno prima: sono i due file
che oggi si aprono ogni giorno.

11. Caricamento su richiesta di ApexCharts (3.9) — 230 KB.
12. Caricamento su richiesta di Excel e Word in IAM (3.10) — 452 KB.
13. Le due interrogazioni prima del login (3.15).

Sommati, quasi 700 KB compressi in meno a ogni apertura.

### Blocco 3 — le decisioni che aspettano te

Nessuna di queste si può fare senza una tua risposta. Te le metto in fila in
ordine di danno che fanno oggi.

14. **Priorità dei ticket** (2.2): scegli la parola, poi si unifica. **Solo dopo**
    si toglie il cerotto (3.19). Mai al contrario.
15. **Formattazione degli importi** (2.5): decidi se "0,00" può diventare "—".
16. **Menu di Contabilità** (2.3) e **Agenda** (2.4): sono anche una questione di
    permessi, non solo di comodità.
17. **Asterischi e cinque campi morti nel wizard Auto** (2.7, 2.8): dipende da
    cosa chiedono le compagnie in arrivo.
18. **Mega-menu di QUOTO** (2.6) e **Infortuni conducente** (2.9).
19. **Il segreto TOTP** (2.17): basta che tu dica come funziona il secondo fattore
    dei portali che usi.
20. **Il limite di dimensione dei file** (2.10): serve un numero di megabyte.

### Blocco 4 — il lavoro grosso, da fare DENTRO la fusione

Queste non le farei adesso. Sono rifacimenti che toccano decine di schermate:
farli ora e poi rifarli durante la fusione è lavoro doppio, e ogni rifacimento
fatto prima aumenta il rischio di conflitti quando i file si spostano.

21. La ricerca cliente (3.14) — la più grossa, ma **senza rete di prove**: un
    modulo alla volta.
22. Il caricamento documenti (3.13), con dentro il limite di dimensione.
23. Il modulo ticket unico (3.18) — richiede prima la decisione su quale delle due
    interfacce sopravvive.
24. Le funzioni di smistamento (3.17).
25. Il controllo del codice fiscale (2.11), che entra nel file condiviso appena
    nasce.
26. Gli scraper Allianz/Italiana (3.21), con la prova aggiornata insieme.

### Ultimo, se avanza tempo

27. Gli stili scritti dentro i tag (3.22): guadagno piccolo, rischio alto, tocca
    ogni schermata.
28. Il carattere in più (3.16) e le due `esc` (3.20): qualche riga.

---

## 5. Quello che NON consiglio di toccare

Queste sono le trappole trovate durante il lavoro. Ognuna sembra codice morto o
un doppione, e non lo è.

**Le due regole di stile a QUOTO `index.html:872-873`.** Sembrano appartenere al
meccanismo spento del wizard Auto. In realtà quella classe è usata da 14 schermate
diverse, e nel wizard Cauzioni il salto passi è **acceso**
(`index.html:14922`, `15028-15030`). Cancellarle spegne la grigiatura di due passi
in una funzione che usate.

**Il file `/home/user/QUOTE/polizza-medici/index.html`.** Sembra una pagina
orfana, perché QUOTO non la collega mai. È invece la pagina di atterraggio delle
campagne pubblicitarie: reindirizza alla landing conservando i parametri della
campagna. Non va né collegata né cancellata. Non c'è niente da decidere.

**`scraper/health.js`.** Sembra il gemello del file morto `scraper/server.js`. È
invece ciò che esegue `npm start` alla radice del repository
(`package.json:6`). Se lo cancelli, `npm start` si rompe. (Va comunque spento
prima il servizio residuo che lo teneva in piedi.)

**La riga QUOTO `index.html:3121`.** Contiene **due** dichiarazioni. La prima
diventa inutile dopo la rimozione del blocco RCVP; la seconda è viva in cinque
punti, uno dei quali nella ricevuta dei pagamenti. Cancellare "la riga 3121" come
verrebbe naturale rompe il file.

**`isSuperAdmin`, `paypPayOnline`, `rcvpRDpayOnline`.** Sono morte, ma toccano
permessi e pagamenti, cioè i due perimetri che il progetto dice di non toccare.
Anche una rimozione di codice morto lì va autorizzata caso per caso. E ricorda:
togliere `isSuperAdmin` non toglie la tua email dal file — quella sta nella
costante di riga `2261` ed è viva.

**`apriQuoto()` in IAM** (`index.html:2909`). Somiglia molto alla schermata di
lancio morta, ma è viva e ha due chiamanti: serve al collaboratore che ha solo il
preventivatore ed è protetta da una prova del banco.

**`page-rca` in QUOTO.** Anche sistemando il menu, quella pagina resta: è l'unico
accesso a "Imbarcazioni" e resta il percorso quando QUOTO si apre a pagina intera.

**Le sette schede "In arrivo".** Non sono un difetto: sono già sbiadite, senza
cursore a mano e con l'etichetta. Se servono da vetrina davanti al cliente,
toglierle è un danno, non uno snellimento. È una decisione commerciale.

**Una memoria breve sull'elenco utenti in IAM.** Sembra la correzione ovvia per le
tre letture ripetute. Non lo è: quell'elenco viene sovrascritto dalla schermata
Trattative con una versione a tre sole colonne (`index.html:5779-5782`). Una
memoria ingenua farebbe comparire elenchi vuoti e caselle senza dati.

**Gli identificativi `ctab-*` e `contab-panel-*` in IAM.** Sono usati dalla prova
`verifica/contabilita-una-schermata.test.mjs`: cambiandoli il banco diventa rosso.

**Il carattere Inter in IAM** (`index.html:18`). È il carattere di tutto il testo,
usato in centinaia di regole. Vale i suoi 48 KB. Solo l'altro va tolto.

**Spostare `tentaLogin` nella cartella comune degli scraper** senza aggiornare
prima la prova. Quella prova legge i sorgenti file per file: quattro prove su
tredici diventano rosse anche se tutto funziona, e quella è la rete che impedisce
il ritorno del ciclo infinito di login.

**I campi "Livello di istruzione" e "Hai figli?"** se una compagnia in arrivo li
chiede. Sono fattori tariffari classici dell'RC auto. Oggi non li legge nessuno,
ma toglierli significa anche perdere lo storico sui preventivi futuri.

---

*Documento scritto in sola lettura: nessun file del progetto è stato modificato,
questo compreso — è l'unico file creato.*
