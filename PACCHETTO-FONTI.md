# Pacchetto fonti — come QUOTO si collega alle compagnie

Stato al **14 agosto 2026**. Ramo esaminato: `claude/vibrant-tesla-o0glfd`
(commit `02f1ee8`) — **è quello da cui il VPS si aggiorna davvero**
(`deploy/autopull.sh`), non `main`.

> **Perché questo documento è stato riscritto.** La versione precedente era del
> 1° agosto e descriveva un ramo diverso da quello in esecuzione. Diceva «il VPS
> è spento, oggi non funziona nulla», «tre compagnie collegate», «solo lo scraper
> moto estrae un premio», «otto indirizzi del pannello non esistono, i pulsanti
> danno 404». **Nessuna di queste quattro cose è più vera.** Un documento che
> descrive il sistema come molto più povero di com'è non è innocuo: fa
> ricominciare da capo lavoro già fatto, e fa cercare guasti dove non ci sono.
>
> Qui ogni riga è stata verificata sul codice del ramo in esecuzione. Dove non ho
> potuto verificare — perché serve entrare sul server — **c'è scritto che non ho
> potuto**, invece di una supposizione scritta come se fosse un fatto.

---

## 0. In dieci righe

Una **fonte** è una compagnia collegata a QUOTO. Collegarla vuol dire quattro
cose: le credenziali del portale (quelle dell'agenzia), un programma che entra al
posto dell'operatore, un modo per capire come parla quel portale, e un semaforo
che dice se il collegamento è vivo.

Il pacchetto è legittimo: sono portali di compagnie con cui Withus ha mandato, e
si automatizza un lavoro che l'operatore farebbe a mano. Tutto è governato da un
pannello riservato a una sola persona (`server/fonti.js`, `SUPER_ADMIN_EMAIL`),
raggiungibile da Internet dietro il login IAM.

**Il servizio è acceso.** Verificato il 14/08/2026:

| indirizzo | risposta |
|---|---|
| `api.withusassicurazioni.it/health` | `200` — `{"ok":true}` |
| `/fonti` e `/fonti/stato` | `401` — protette, come devono essere |

Il `401` è una buona notizia, non un guasto: vuol dire che le rotte riservate
chiedono l'autenticazione a chi arriva da fuori.

---

## 1. Che cosa c'è oggi

**Dieci scraper** con un servizio di quotazione, ognuno un browser vero
(Playwright + Chromium su display virtuale) con un telecomando HTTP che ascolta
**solo su `127.0.0.1`** — dall'esterno non sono raggiungibili.

| | porta | righe | che cos'è |
|---|---|---|---|
| **HDI** | 4400 | 2746 | preventivo auto |
| **Italiana** | 4300 | 1718 | preventivo auto |
| **Allianz** | 4200 | 1261 | **interrogazione ANIA per targa** (situazione assicurativa e proprietario) — non un preventivo |
| **AXA** | 4700 | 1022 | preventivo auto (secondo fattore TOTP) |
| **Groupama** | 4500 | 715 | preventivo auto (OTP via email) |
| **24H · Moto Platinum** | 4100 | 689 | preventivo moto |
| **Prima** | 4600 | 534 | preventivo auto (secondo fattore TOTP) |
| **Quotiamo** | 5000 | 159 | comparatore esterno, clonato da `scraper/_template` |
| **Kube** | 4900 | 260 | **non è un preventivatore**: serve a mappare il flusso del portale |
| **Assieasy** | 4800 | 273 | **non è un preventivatore**: è un CRM, serve a catturarne le API |

`scraper/leoaccess/` non contiene nessuno scraper: solo `install-key.sh` e i file
di avvio.

> **Otto fonti, non dieci.** Kube e Assieasy sono strumenti di studio, non
> compagnie che quotano. Contarli fra le fonti gonfia il numero e fa sembrare il
> pacchetto più ricco di quanto è. E delle otto, **Allianz non quota**: risponde
> a «di chi è questa targa e com'è assicurata». È utile, ma è un'altra cosa.

### Chi decide quale scraper interrogare

`scraperUrlFor` (`server/fonti.js:49`) sceglie **per somiglianza di nome**:
`itali` → Italiana, `hdi` → HDI, `groupama`, `prima`, `axa`. Le fonti create dal
pannello indicano il loro scraper con `scraper_url` o `scraper_port`.

Attenzione: la somiglianza è cieca. Una fonte nuova chiamata «Prima Casa»
finirebbe sullo scraper di Prima Assicurazioni senza che nessuno se ne accorga.
Se un giorno serve, il posto da cambiare è quella funzione.

---

## 2. Le tre cose da guardare, in ordine

### 2.1 La chiave di cifratura delle credenziali — **DA VERIFICARE SUL SERVER**

```js
// server/fonti.js:92
const SECRET = process.env.FONTI_SECRET || ('withus-fonti-' + (process.env.HOSTNAME || 'vps') + '-v1');
```

Se `FONTI_SECRET` non è impostata, la chiave si ricava da una stringa che sta nel
sorgente — e il sorgente è in un repository pubblico. Le credenziali delle
compagnie resterebbero cifrate solo in apparenza.

C'è un secondo effetto, ed è probabilmente quello che vi ha fatto perdere più
tempo. Il codice stesso lo dice (`server/fonti.js:535-541`): se backend e scraper
hanno **due valori diversi** di `FONTI_SECRET`, lo scraper non riesce a
decifrare le credenziali, l'accesso automatico non parte mai — **in silenzio** —
e il pannello continua a chiedere di rifare il login. I «re-login infiniti» non
sono un problema del portale della compagnia: sono due chiavi che non
combaciano.

**Non ho potuto verificarlo da qui**: serve leggere l'ambiente sul VPS. È la
prima cosa da controllare.

```bash
# sul server, per ciascun servizio
systemctl show withus-backend -p Environment | grep -c FONTI_SECRET
systemctl show hdi-scraper     -p Environment | grep -c FONTI_SECRET
```

Se manca da qualche parte, o se i due valori differiscono, è quello il guasto.

### 2.2 La cattura di rete restituisce le password dei portali

Esiste un modulo apposta per non far uscire niente di riservato:
`scraper/comune/riservatezza.mjs` maschera password, targhe, date di nascita,
codici fiscali e IBAN. È scritto bene. Il problema è **dove viene applicato**.

| | fotografia della pagina (`richDump`) | cattura di rete (`/sniff`) |
|---|---|---|
| Allianz, HDI, Italiana, 24H/moto | ✅ ripulita | ❌ **grezza** |
| AXA, Groupama, Prima, Quotiamo, Kube, Assieasy | ❌ **non ripulita** | ❌ **grezza** |

Le fotografie della pagina sono coperte in **4 scraper su 10**. La cattura di
rete **in nessuno**: `/sniff` restituisce i corpi delle richieste così come
sono (per esempio `scraper/prima/quote-service.mjs:506`), e il corpo della POST
di login **contiene la password del portale in chiaro**.

Non è una falla aperta su Internet — gli scraper ascoltano su `127.0.0.1` e il
pannello è dietro il login del Super Admin. È un rischio di **travaso**: quelle
risposte finiscono nel browser di chi usa il pannello, nei log e in una eventuale
cattura salvata. Il giorno in cui una di quelle finisce incollata in un
messaggio, in una segnalazione o in una chat con un assistente, la password del
portale è uscita.

**Cosa fare**: far passare l'uscita di `/sniff` da `ripulisciQualsiasi()`, e
aggiungere l'import di `riservatezza.mjs` ai sei scraper che non ce l'hanno. È un
lavoro piccolo e uguale per tutti.

### 2.3 Il freno anti-blocco protegge solo tre compagnie su dieci

`scraper/comune/freno.mjs` esiste e fa la cosa giusta: dopo **3 fallimenti di
fila** smette di bussare al portale e aspetta (15 minuti, poi il doppio, fino a
un'ora). Serve a non far bloccare l'utenza dell'agenzia dalla compagnia — che è
un danno vero, non un fastidio: un'utenza bloccata si sblocca telefonando alla
compagnia.

Lo usano **Allianz, HDI e Italiana**. Gli altri sette no: AXA, Groupama, Prima,
24H/moto, Quotiamo, Kube, Assieasy. Su quei sette, credenziali sbagliate o
scadute diventano un martellamento.

---

## 3. I salvataggi notturni

`server/backup.js` produce `backups/withus-AAAAMMGG-hhmm.tar.gz` e ne tiene
**14**, sulla stessa macchina. Dentro ci sono due cose diverse:

- i file di configurazione, **cifrati** (fra cui `fonti.store.json`, le
  credenziali delle compagnie);
- il dump delle tabelle Supabase, letto con la chiave di servizio che **scavalca
  la RLS** — quindi tutto, e **in chiaro**: i dati dei clienti.

La cartella `backups/` è fuori da git e non è servita da nginx: non è
raggiungibile dal web. Ma sono quattordici copie non cifrate dell'anagrafica
clienti su un disco solo. Chi entra su quella macchina non ha bisogno di
decifrare niente, e un disco che si rompe se le porta via tutte insieme.

**Da decidere** (non è una scelta tecnica, è tua): cifrare l'archivio intero, o
portarlo fuori dalla macchina, o entrambe.

---

## 4. Come si aggiornano gli scraper sul server

`deploy/autopull.sh` gira ogni minuto: tira il ramo
`claude/vibrant-tesla-o0glfd`, riavvia il backend se è cambiato `server/`,
installa e riavvia gli scraper nuovi. **Ripara da solo** uno scraper spento o
disabilitato — quindi fermarne uno a mano non tiene: torna su entro un minuto.

> **La trappola numero uno.** Il sito va in produzione da `main`, il backend e
> gli scraper da questo ramo. Una modifica a `server/` o `scraper/` pubblicata
> solo su `main` **non arriva alla macchina**, e non c'è nessun errore a dirlo.
> Vedi `UNIFICAZIONE.md`.

---

## 5. Quando qualcosa non va

| sintomo | dove si guarda |
|---|---|
| il pannello richiede il login all'infinito | `FONTI_SECRET` disallineata fra backend e scraper — §2.1. È la causa più probabile, e non dà nessun errore |
| una compagnia non quota | pannello Fonti; poi `/status` dello scraper: dice se è loggato e se il freno è tirato |
| il freno è tirato e non si sblocca | si toglie solo da una persona, dalla rotta `/login` **esatta** |
| il backend non ha la modifica | è stata pubblicata solo su `main`? — §4 |
| una schermata è vuota | RLS di Supabase: l'utente vede solo quello che il suo ruolo permette |

Una regola che vale per tutti gli scraper: **«fatto» non si dice a vuoto.** Se il
portale cambia e non si legge un solo campo, la risposta è `PORTALE_CAMBIATO`,
non un successo con i campi vuoti. Distinguere «ho cercato e non c'è» da «non ho
cercato» è la differenza fra una risposta che si accetta e una che si va a
guardare.

---

## 6. Che cosa manca per davvero

Non sono difetti del codice: sono cose che aspettano un dato o una decisione.

1. **AXA e Allianz aspettano i segreti del secondo fattore** (voce di backlog del
   12 luglio, ancora aperta). Finché non ci sono, quei due collegamenti non
   partono — e il codice è già scritto.
2. **`FONTI_SECRET` sul server** — §2.1.
3. **Le API ufficiali HDI** (`HDI-API.md`): 169 rotte OAuth2, il collegamento è
   scritto, collaudato e **spento**. Quando sarà acceso sostituirà 2746 righe di
   browser pilotato — ma **solo dopo** che i due danno lo stesso premio su targhe
   vere.

---

## 7. Che cosa NON ho verificato

Perché richiede di entrare sul server o di avere le credenziali del pannello.
Sta scritto qui invece che essere lasciato intendere:

- se `FONTI_SECRET` è impostata, e se backend e scraper hanno lo stesso valore;
- **se le compagnie oggi restituiscono davvero un premio**: `/fonti/stato`
  risponde `401` a chi non è autenticato, quindi da fuori si vede che il servizio
  è vivo, non che i collegamenti funzionano. Il codice per quotare c'è in otto
  scraper; che oggi vada a buon fine si vede solo dal pannello;
- quali scraper siano effettivamente accesi come servizi (`systemctl`);
- se i salvataggi notturni stiano girando e da quanto.
