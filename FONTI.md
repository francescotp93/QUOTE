# Il sottosistema FONTI — come funziona, e dove si può migliorare

Documento tecnico. Scritto il **4 agosto 2026** misurando il codice, non a
memoria. È pensato per essere dato a chi non conosce il sistema e deve
proporre miglioramenti.

> **Il repository è pubblico.** Qui non ci sono credenziali, indirizzi di
> macchine né dati di clienti — e non devono entrarci. Le credenziali dei
> portali vivono cifrate sulla macchina; i segreti nel `.env`.

---

## 1. Che problema risolve

Withus Assicurazioni deve fare preventivi su **dieci compagnie diverse**.
Nessuna di queste compagnie (tranne una, di recente) espone un'API: l'unico
modo di ottenere un premio è **usare il loro portale web**, come farebbe una
persona.

«Fonti» è il sottosistema che fa questo: tiene aperte dieci sessioni sui
portali delle compagnie e le interroga per conto del preventivatore.

```
QUOTO (browser)
   │  «quanto costa la RC di questa targa?»
   ▼
Backend Express (VPS)  ── /fonti, /moto, /crm …
   │  HTTP su 127.0.0.1
   ▼
SCRAPER  ×10  ── ognuno un Chromium vero su display virtuale
   │  clic, campi, attese
   ▼
Portale della compagnia
```

---

## 2. I pezzi, e quanto pesano

### Backend (`server/`)

| file | righe | cosa fa |
|---|---|---|
| `fonti.js` | 825 | il Pannello Fonti: elenco, credenziali cifrate, login guidato, sonde, cattura API |
| `fontiSonda.js` | 129 | interroga tutti gli scraper **in parallelo** e mette in cache lo stato |
| `fontiWatchdog.js` | 274 | la vigilanza: controlla ogni 5 minuti e avvisa quando qualcosa cambia |

Rotte del pannello (tutte sotto autenticazione):

```
GET  /fonti/salute                   stato di tutte le fonti
GET  /fonti/:id                      dettaglio di una fonte
POST /fonti/:id/credenziali          salva le credenziali (cifrate)
POST /fonti/:id/accedi               avvia il login
GET  /fonti/:id/loginstate           a che punto è il login
POST /fonti/:id/codice               invia il codice a due fattori
POST /fonti/:id/conferma-codice      conferma
POST /fonti/:id/altro-codice         chiedine un altro
GET  /fonti/:id/verifica             prova la sessione
GET  /fonti/:id/preventivo           una quotazione di prova
GET  /fonti/:id/explore              mappa la pagina (diagnostica)
GET  /fonti/:id/api                  cattura le chiamate di rete
POST /fonti/:id/sniff/:azione        registra il traffico del portale
```

### Gli scraper (`scraper/`)

| compagnia | righe | porta | freno | ripulitura |
|---|---|---|---|---|
| hdi | 2746 | 4400 | **sì** | **sì** |
| italiana | 1718 | 4300 | **sì** | **sì** |
| allianz | 1261 | 4200 | **sì** | **sì** |
| axa | 1022 | — | no | no |
| groupama | 715 | — | no | no |
| moto (24H) | 689 | 4100 | no | **sì** |
| prima | 534 | — | no | no |
| assieasy | 273 | — | no | no |
| kube | 260 | — | no | no |
| quotiamo | 159 | — | no | no |

Moduli condivisi (`scraper/comune/`):

| modulo | righe | cosa fa | dov'è |
|---|---|---|---|
| `freno.mjs` | 99 | smette di bussare al portale dopo N accessi falliti | **entrambi i rami** |
| `riservatezza.mjs` | 150 | oscura password, targhe, date di nascita, codici fiscali | **entrambi i rami** |
| `rotte.mjs` | — | confronto esatto dei nomi delle rotte | **solo `main`** ⚠ |
| `esito.mjs` | — | «fatto» non si dice a vuoto | **solo `main`** ⚠ |

⚠ Vedi §7: i due moduti marcati **non sono sulla macchina**.

---

## 3. Come funziona uno scraper

Ognuno è un processo Node che:

1. apre un **Chromium vero** (Playwright, `launchPersistentContext`) su un
   display virtuale (Xvfb) — non headless, perché diversi portali riconoscono e
   bloccano i browser senza finestra;
2. tiene la sessione in una cartella `userdata/`, così **sopravvive ai riavvii**;
3. espone un **telecomando HTTP su `127.0.0.1`** (mai verso l'esterno).

Le rotte che ogni scraper espone, più o meno le stesse:

```
/status          è vivo? è loggato? il freno è tirato?
/login           fa il login (ed è l'unico gesto che TOGLIE il freno)
/loginstate      a che punto è il login guidato
/logindump       fotografia della schermata di login (diagnostica)
/verifica        la sessione è ancora buona?
/premio          la quotazione vera
/lookup          interroga i dati di un veicolo / della banca dati
/shot            uno screenshot
/explore         mappa i controlli della pagina
/sniff           registra le chiamate di rete del portale
/pausakeepalive  sospende il tenersi-svegli durante una quotazione
```

Il backend chiama solo `127.0.0.1:<porta>`: **gli scraper non sono raggiungibili
da fuori**.

---

## 4. Le credenziali

Stanno in un file sulla macchina, **cifrate a riposo** con AES-256-GCM
(`server/fonti.js`). La chiave viene da `FONTI_SECRET`; se manca, se ne deriva
una dal nome della macchina — che è un ripiego, non una scelta (vedi §7).

Ogni scraper decifra da sé, con la stessa chiave. Se la chiave non combacia, lo
scraper **non tenta il login**: dice «credenziali non leggibili» invece di
provare all'infinito con dati vuoti.

Per le compagnie con **codice a due fattori** ci sono due strade:

- **TOTP**: si salva il *segreto* e il server genera il codice a sei cifre da
  solo → login completamente automatico;
- **login guidato**: il portale manda un codice via SMS o email, il Pannello
  Fonti lo chiede a una persona e lo inoltra allo scraper.

### 4-bis. Il guasto delle due chiavi (14 agosto 2026)

Quello che c'è scritto qui sopra è com'è fatto il sistema. Ecco com'è andata
davvero, perché è la cosa più istruttiva di tutto il documento.

`FONTI_SECRET` è stato aggiunto a `server/.env` **dopo** che alcune credenziali
erano già state salvate. Da quel momento il backend ha cifrato con la chiave
nuova, ma nell'archivio è rimasto quello che la chiave vecchia — quella derivata
dal nome della macchina — aveva scritto prima. Risultato: **un archivio cifrato
con due chiavi**, a macchia di leopardo.

Il punto non è l'errore, è che **non si vedeva**. Un campo che non si decifra
torna stringa vuota, non un'eccezione. Quindi:

- lo scraper Allianz diceva «manca il segreto TOTP» — e il segreto c'era;
- Prima diceva «non ho credenziali» — e le aveva;
- il pannello, che legge con la chiave del backend, le mostrava tutte presenti.

Due schermate che raccontano fatti diversi sulla stessa cosa, e nessun errore da
nessuna parte. Sono serviti tre giri di misurazione sulla macchina per trovarlo:
prima leggendo cosa risponde ogni `/status`, poi provando **quale chiave apre
quale campo**, infine leggendo l'ambiente di ogni processo in esecuzione.

**Riparato con** `server/fontiRicifra.mjs` — cerca ogni valore cifrato a
qualunque profondità e ricifra con la chiave attuale solo quello che non si apre.
Di suo non scrive; `--scrivi` fa prima una copia di sicurezza. Se non trova la
chiave del backend si ferma **prima di guardare qualunque cosa**, perché
altrimenti direbbe «è già tutto sotto la stessa chiave» — una frase falsa che
chiude il problema facendolo credere risolto.

**Una regola nata da qui:** un campo-*segreto* TOTP più corto di 16 caratteri non
viene ricifrato. Nell'archivio vero, `allianz.totp` conteneva **sei caratteri**:
qualcuno aveva scritto il codice momentaneo nella casella del seme. Ricifrarlo
sarebbe stato peggio che lasciarlo — oggi lo scraper non lo apre e quindi non
tenta il login, ricifrato avrebbe generato codici sbagliati e li avrebbe mandati
al portale uno dopo l'altro, fino a bloccare l'utenza.

> **Se proponi modifiche in questa zona**, la lezione da portarsi dietro è una
> sola: *un valore che non si decifra non è un valore vuoto*. Ogni volta che il
> codice traduce «non lo so» in un valore normale — stringa vuota, `false`,
> «scaduta» — sta preparando un guasto che nessuno vedrà.

---

## 5. Le tre regole che tengono in piedi il sistema

Sono nate tutte da guasti veri. Chi propone modifiche deve conoscerle.

### 5.1 Il freno — «non si bussa all'infinito»

**Il guasto**: un login sbagliato veniva ritentato a ogni giro, per ore. Le
compagnie bloccano l'utenza dopo un certo numero di tentativi falliti. Una
notte gli scraper hanno bussato 172 volte.

**La regola**: dopo 3 accessi falliti lo scraper **smette**. Aspetta 15 minuti,
poi il doppio, fino a un'ora. Il freno si toglie **solo da una persona**, dalla
rotta `/login` esatta.

```
[freno] tentativo di accesso saltato — in attesa, prossimo tentativo 10:36:59
```

Il freno sta **dentro** la funzione di login, non attorno alle sue chiamate:
così non esiste un modo di scavalcarlo aggiungendo una chiamata nuova.

### 5.2 Le rotte si riconoscono per il nome intero

**Il guasto**: `'/logindump'.startsWith('/login')` è **vero**. Siccome `/login`
era dichiarata prima, `/logindump` non è mai stata raggiungibile: chiamare una
rotta di **diagnostica** eseguiva un **login**.

Peggio: `/login` toglie il freno. Quindi bastava chiedere una diagnostica per
rimettere in moto il ciclo di login che il freno stava fermando.

**La regola**: ogni rotta si riconosce per il nome intero, o con una guardia
negativa esplicita:

```js
if (u.pathname.startsWith('/login') && !u.pathname.startsWith('/logindump'))
```

### 5.3 Niente dati di clienti verso il browser

**Il guasto**: le fotografie della pagina (`/shot`, `/dump`, il testo grezzo)
uscivano **crude** verso il browser: password in chiaro, targhe, date di
nascita, codici fiscali.

**La regola**: tutto ciò che esce da uno scraper passa da
`comune/riservatezza.mjs`. Un campo che il portale dichiara «testo» ma si
chiama `password` è comunque un segreto.

### 5.4 «Fatto» non si dice a vuoto

Uno scraper non deve **mai** rispondere «ok» quando non ha fatto niente.

Casi reali chiusi da poco:
- `moto /lookup` diceva «fatto» con il veicolo **tutto vuoto** (il portale aveva
  cambiato le etichette);
- `allianz /lookup` diceva «cercato, non trovato» anche quando il campo targa
  non era stato **nemmeno compilato** — cioè quando la ricerca non era mai
  partita.

«Ho cercato e non c'è» e «non ho cercato» sono due fatti diversi: il primo si
accetta, il secondo si va a guardare.

---

## 6. La vigilanza

`fontiWatchdog.js` gira ogni 5 minuti: interroga tutte le fonti e manda una
mail **solo quando qualcosa cambia**.

Come è fatta adesso (corretta il 4/8/2026, dopo che aveva riempito la casella):

- **memoria su disco**: sopravvive ai riavvii del backend, che sono frequenti
  perché ogni rilascio che tocca `server/` lo riavvia;
- **due conferme** prima di annunciare: una fonte che oscilla non manda una mail
  a ogni giro;
- **`dettoSalute`**: lo stato già comunicato per posta. Impedisce di ripetere lo
  stesso allarme;
- **una mail per giro**, non due: cadute e rientri dello stesso momento stanno
  insieme;
- la quarantena avvisa **una volta sola**.

Se il file di memoria non è scrivibile, si perde la memoria — **non la
vigilanza**. Una vigilanza che si spegne perché non riesce a prendere appunti è
peggio di una che li perde.

### La sonda

`fontiSonda.js` interroga tutti gli scraper **in parallelo**, non uno alla
volta. Il motivo: gli scraper *lenti* (browser occupato da una quotazione)
costavano 6 secondi ciascuno, e il pannello ci metteva mezzo minuto ad aprirsi.

---

## 7. Dove si può migliorare — i punti aperti, in ordine di peso

Questa è la parte utile per chi deve proporre qualcosa.

### 7.1 Il freno ce l'hanno 3 scraper su 10 ⚠⚠

Solo **hdi, italiana, allianz**. Gli altri sette — axa, groupama, moto, prima,
assieasy, kube, quotiamo — ritentano il login senza limite. È lo stesso guasto
che ha fatto bussare 172 volte, semplicemente non è ancora successo su di loro.

`comune/freno.mjs` esiste ed è senza dipendenze: applicarlo è meccanico. La
difficoltà è che ogni scraper ha una funzione di login diversa.

### 7.2 La ripulitura ce l'hanno 4 su 10 ⚠⚠

Solo **allianz, italiana, hdi, moto**. Gli altri sei possono far uscire dati di
clienti nelle fotografie di diagnostica.

### 7.3 Due moduli comuni non sono sulla macchina ⚠

`comune/rotte.mjs` e `comune/esito.mjs` esistono **solo sul ramo `main`**. La
VPS insegue un ramo diverso (`claude/vibrant-tesla-o0glfd`), quindi il codice
che gira non li ha.

Questo è un caso particolare di un problema più grande: **frontend e backend
seguono rami diversi**, e ogni modifica al motore va pubblicata due volte.
Il piano per unificarli sta in `UNIFICAZIONE.md`.

### 7.4 La chiave di cifratura ha un ripiego debole

Se `FONTI_SECRET` non è impostata, la chiave si deriva dal nome della macchina.
È prevedibile. Va reso obbligatorio, con rifiuto esplicito all'avvio invece di
un ripiego silenzioso.

### 7.5 Dieci scraper, dieci strutture diverse

Vanno da 159 a 2746 righe. Ognuno ha il suo login, il suo modo di leggere il
premio, i suoi selettori. Non c'è un contratto comune: aggiungere una compagnia
significa scrivere tutto da capo.

`scraper/_template` esiste ma è appena abbozzato. Un'interfaccia condivisa
(`login()`, `verifica()`, `premio(dati)`, `stato()`) renderebbe ogni scraper un
adattatore invece di un programma a sé.

### 7.6 Il browser vero costa

Ogni scraper è un Chromium acceso. Dieci Chromium su una macchina sola pesano,
e ognuno può cadere per conto suo. Alcuni hanno già un auto-recupero (`ensurePage`);
gli altri no.

**La direzione giusta è un'altra**: dove la compagnia espone API, si smette di
pilotare il browser. HDI ne ha appena pubblicate **169** (`HDI-API.md`), e il
collegamento è già scritto — spento in attesa delle credenziali. Sostituirebbe
2746 righe di browser pilotato.

### 7.7 Le sessioni scadono e nessuno lo sa in anticipo

Oggi si scopre che una sessione è morta **quando serve**, cioè in mezzo a una
quotazione di un cliente. Un controllo preventivo che rinnova prima della
scadenza — dove il portale lo permette — toglierebbe il buco.

### 7.8 Non c'è una storia

Il pannello dice **come sta adesso** una fonte. Non dice quante volte è caduta
questo mese, né quanto dura in media una sessione. Senza quei numeri, decidere
su quale scraper investire è a sensazione.

---

## 8. Come si collauda

```bash
node scraper/verifica/controlla.mjs     # 7 suite: freno, rotte, riservatezza, esito
node server/fontiWatchdog.test.mjs      # la vigilanza
node server/fontiWatchdogSilenzio.test.mjs
node server/fontiSonda.test.mjs         # le sonde in parallelo
```

Le prove leggono il **sorgente** degli scraper, non li eseguono: far partire
dieci browser in un banco di prova sarebbe più fragile di quello che sorveglia.
Verificano che le regole **siano scritte** dove devono essere.

### La regola del collaudo

**Ogni prova nuova va fatta fallire sul codice di prima.** Una prova che passa
sia prima sia dopo non sorveglia niente.

```bash
git worktree add /tmp/prima origin/main --detach
cp scraper/verifica/nuova.test.mjs /tmp/prima/scraper/verifica/
cd /tmp/prima && node scraper/verifica/nuova.test.mjs   # deve essere ROSSA
```

---

## 9. Se proponi una modifica, tieni conto di questo

1. **Il freno non si scavalca.** Ogni via nuova verso il login deve passare da
   lì. Se aggiungi una rotta che fa login, il freno va rispettato.
2. **Ogni rotta nuova va dichiarata con una guardia esplicita**, o mangerà
   quelle che le somigliano.
3. **Tutto quello che esce da uno scraper passa dalla ripulitura.** Anche una
   fotografia di diagnostica che «tanto la guardo solo io».
4. **Non si dice «fatto» senza aver fatto.** Se un campo non si legge, la
   risposta è un errore classificato, non un successo con i campi vuoti.
5. **Il codice è in italiano**: nomi, commenti, messaggi. I commenti dicono
   **perché**, non cosa.
6. **I messaggi d'errore dicono cosa fare.** Non «errore 502» ma «la sessione
   Allianz è scaduta: apri il Pannello Fonti e premi Verifica accesso».
7. **Frontend e backend seguono rami diversi** (§7.3). Una modifica agli
   scraper pubblicata solo su `main` non arriva alla macchina.
8. **Niente credenziali in chiaro**, mai, nemmeno negli esempi.

---

## 10. Glossario

| termine | significato |
|---|---|
| **fonte** | una compagnia interrogabile: uno scraper + le sue credenziali + il suo stato |
| **Pannello Fonti** | la schermata in QUOTO da cui si governano (solo amministratori) |
| **freno** | il meccanismo che ferma i tentativi di accesso ripetuti |
| **sonda** | l'interrogazione parallela dello stato di tutti gli scraper |
| **vigilanza** | il controllo periodico che avvisa per email quando qualcosa cambia |
| **login guidato** | la procedura in cui una persona inserisce il codice a due fattori |
| **cattura / sniff** | la registrazione delle chiamate di rete del portale, per capire le sue API |
| **quarantena** | la pausa lunga dopo troppi tentativi falliti di seguito |
