# Tutti i processi dell'ecosistema With Us

Inventario completo di **cosa gira** e **cosa succede**, misurato sulla
macchina il **4 agosto 2026**.

Serve a chi deve studiare il sistema e capire dove sono i problemi.

> Il repository è pubblico e questo documento è destinato a un servizio esterno:
> nessuna credenziale, nessun indirizzo di macchina, nessun dato di cliente.
> Le porte elencate sono tutte **loopback** (`127.0.0.1`), non raggiungibili da
> fuori.

---

## PARTE A — I processi automatici (cosa gira da solo)

### A.1 Sulla VPS

| processo | tipo | ogni | cosa fa |
|---|---|---|---|
| `withus-backend` | servizio | sempre acceso | il backend Express: API per QUOTO e IAM |
| `allianz-scraper` | servizio | sempre acceso | browser sul portale Allianz |
| `assieasy-scraper` | servizio | sempre acceso | browser sul portale AssiEasy |
| `axa-scraper` | servizio | sempre acceso | browser sul portale AXA |
| `groupama-scraper` | servizio | sempre acceso | browser sul portale Groupama |
| `hdi-scraper` | servizio | sempre acceso | browser sul portale HDI |
| `italiana-scraper` | servizio | sempre acceso | browser sul portale Italiana (Plurima) |
| `kube-scraper` | servizio | sempre acceso | browser sul portale Kube |
| `moto-scraper` | servizio | sempre acceso | browser su 24H Moto Platinum |
| `prima-scraper` | servizio | sempre acceso | browser sul portale Prima |
| `quotiamo-scraper` | servizio | sempre acceso | browser sul portale Quotiamo |
| `withus-autopull.timer` | timer | **1 minuto** | tira il ramo da GitHub, riavvia ciò che è cambiato |
| `cmd-runner` | servizio | **30 secondi** | canale di diagnostica: legge un comando da un ramo git ed esegue |

**Misurato:** 13 servizi, 11 attivi. `10 × node quote-service.mjs`.

### A.2 Il peso vero

```
101   processi Chromium
 10   display virtuali Xvfb  (:90 … :99)
 10   porte telecomando      (4100…5000, loopback)
 10   porte VNC              (5901…5909, loopback)
```

**Centouno processi Chromium** su una macchina sola. Ogni scraper apre un
browser vero — non headless, perché diversi portali riconoscono e bloccano i
browser senza finestra — e ogni browser si porta dietro i suoi processi figli.

È il costo del non avere API. Vedi §D.1.

### A.3 Dentro il backend

| processo | ogni | cosa fa |
|---|---|---|
| **vigilanza fonti** | 5 minuti | controlla le 10 fonti, avvisa per email **solo se qualcosa cambia** |
| **sonda** | a richiesta | interroga tutti gli scraper **in parallelo** e mette in cache lo stato |
| **keep-alive** degli scraper | variabile | tiene viva la sessione sul portale; si sospende durante una quotazione |

### A.4 Su Supabase

| lavoro | quando | cosa fa |
|---|---|---|
| `posta_triage_workhours` | **ogni 10 min, 7:00-16:00, lun-ven** | smista la posta in arrivo |

Un solo lavoro pianificato. Gira **solo in orario di lavoro**: fuori, tace.

### A.5 Su GitHub

| processo | quando | cosa fa |
|---|---|---|
| **GitHub Pages · QUOTO** | a ogni push su `main` | ripubblica il sito |
| **GitHub Pages · IAM** | a ogni push su `main` del suo repo | ripubblica il sito |

---

## PARTE B — I processi operativi (cosa succede quando si lavora)

### B.1 Fare un preventivo auto

```
targa + data di nascita
   ├─► [in parallelo, in sottofondo]
   │     recupero VEICOLO   da portale Italiana   ~15-25 s
   │     recupero PROPRIETARIO da banca dati ANIA (via Allianz)
   │
   ├─► il codice fiscale è già nostro?
   │      sì → vincono i NOSTRI dati
   │      no → si CHIEDE se salvarlo come lead
   │
   ├─► sette passi guidati (targa, anagrafiche, veicolo,
   │   situazione, ARD/CVT, preventivo, conferma)
   │
   └─► premi da 5 compagnie, a confronto
```

**Chi lo avvia**: un collaboratore, da QUOTO.
**Cosa tocca**: `quote_anagrafiche`, `quote_preventivi`, gli scraper.
**Dove si rompe**: sessione del portale scaduta; portale che cambia una pagina;
i 15-25 secondi di attesa.

### B.2 Censire un'anagrafica

Tre schermate, sempre nello stesso ordine: **scegli chi c'è già → cerchi →
compili**. «Aggiungi» apre la **ricerca**, non la scheda vuota.

Le regole: senza codice fiscale, cognome, nome e indirizzo non si salva; con
partita IVA servono ragione sociale e **PEC oppure SDI**; un indirizzo non
certificato va confermato dalla finestra manuale.

Codice fiscale e partita IVA sono **unici nel database**: il doppione lo ferma
la tabella, non solo la schermata.

### B.3 Dal preventivo alla polizza

```
preventivo ─► proposta ─► emissione ─► polizza
                                          │
                                          ├─► titoli (le rate)
                                          ├─► documenti di pratica
                                          └─► scadenza calcolata dalla durata
```

L'emissione crea **sempre** la riga di polizza e genera **sempre** le rate. È
idempotente: rifarla non crea doppioni.

### B.4 La catena del denaro

```
polizza ─► titoli (rate)  ─► incasso ─► quietanza
                  │
                  └─► non pagato oltre la scadenza = INSOLUTO
```

«Insoluto» è una **condizione calcolata**, non un campo da aggiornare a mano:
non può restare indietro rispetto alla realtà.

### B.5 I quattro stati della polizza

Una polizza non ha *uno* stato: ne ha **quattro indipendenti**, perché avanza su
più fronti insieme.

| | |
|---|---|
| **pagamento** | non pagato · sospeso · pagato · annullata |
| **perfezionamento** | calcolato dai documenti presenti, non messo a mano |
| **rendicontazione** | verso la compagnia |
| **copertura** | dedotta dalle date |

Nel portafoglio sono quattro pallini, sempre nello stesso ordine, ognuno con la
sua spiegazione. Il colore non è mai l'unico segnale.

### B.6 Scadenze e rinnovi

Lo scadenzario ordina per urgenza e dice **se il rinnovo è già stato lavorato**.
Le polizze senza scadenza non ci entrano (e la spia segnala che manca).

### B.7 Il sinistro

Non è un modulo: è una **pratica con dentro elenchi**. Controparti (un
tamponamento a catena ne ha diverse) e partite di danno, ognuna col suo stato —
una può essere liquidata mentre un'altra è ancora in perizia. I totali si
sommano, non si digitano.

### B.8 La coda ticket

Una sola coda, che si vede da due facce (IAM e QUOTO) ma è **lo stesso
archivio**. I ticket si aprono dalla scrivania.

### B.9 La quadratura di giornata

Il momento contabile: si confronta quello che è entrato con quello che
risulta. Da lì nascono **anomalie** e **sospesi**.

### B.10 La firma

```
documento ─► richiesta di firma ─► firma ─► documento firmato in pratica
```

Passa da Brevo per l'invio. **Nessun invio parte senza conferma.**

### B.11 Le campagne

```
elenco destinatari ─► BOZZA ─► conferma ─► invio
```

Tre serrature prima di un invio: conferma, conteggio dei destinatari a schermo,
permesso, e una parola da scrivere a mano. La chiave di Brevo **non entra mai
nel browser**.

### B.12 Il diario di lavoro

Tre viste: elenco, **settimana** (griglia oraria con la coda «da gestire oggi»
accanto) e mese.

### B.13 Governo delle fonti

```
credenziali (cifrate) ─► login ─► [2FA: TOTP automatico oppure codice a mano]
                                        │
                                        ▼
                              sessione viva sul portale
                                        │
                          vigilanza ogni 5 min ─► email SOLO se cambia
```

---

## PARTE C — Come il codice arriva in produzione

```
push su GitHub
   │
   ├─► FRONTEND ──► GitHub Pages ──► i due siti          (ramo: main)
   │
   └─► BACKEND + SCRAPER ──► autopull (ogni minuto) ──► VPS
                                                  (ramo: DIVERSO da main)
```

> ⚠ **Frontend e backend seguono rami diversi.** Una modifica a `server/` o
> `scraper/` pubblicata solo su `main` **non arriva mai alla macchina**. Va
> pubblicata due volte. È la trappola numero uno del sistema.

`autopull` inoltre **ripara da solo**: uno scraper spento o disabilitato torna
su entro un minuto. Fermarne uno a mano non tiene.

---

## PARTE D — Dove il sistema è fragile

Questa è la parte utile per chi deve trovare cosa non va.

### D.1 Centouno processi Chromium

Dieci browser veri su una macchina sola. Ognuno può cadere per conto suo;
alcuni hanno un auto-recupero, altri no. È il costo del non avere API.

HDI ne ha appena pubblicate 169 e il collegamento è già scritto (spento in
attesa delle credenziali): sostituirebbe 2746 righe di browser pilotato.

### D.2 Il freno ce l'hanno 3 scraper su 10

Solo hdi, italiana, allianz. Gli altri sette **ritentano il login senza
limite**. È lo stesso guasto che una notte ha fatto bussare 172 volte al
portale Allianz — semplicemente non è ancora successo su di loro.

Le compagnie bloccano l'utenza dopo troppi tentativi falliti.

### D.3 La ripulitura ce l'hanno 4 su 10

Le fotografie di diagnostica degli altri sei possono far uscire dati di clienti
verso il browser.

### D.4 Due rami invece di uno

Ogni modifica al motore va pubblicata due volte. Prima o poi qualcuno se ne
dimentica, e il sintomo («la modifica non c'è») non porta alla causa. Il piano
per unirli è scritto, non ancora eseguito.

### D.5 Il canale comandi

Un servizio che ogni 30 secondi legge un comando da un ramo git ed esegue.
Comodo per la diagnostica, ma la sicurezza dipende **interamente** da chi ha
accesso in scrittura al repository.

### D.6 Dieci scraper, dieci strutture

Da 159 a 2746 righe. Nessun contratto comune: aggiungere una compagnia
significa scrivere tutto da capo.

### D.7 Un solo punto per tutto

**Un solo progetto Supabase** contiene sia IAM sia QUOTO. Se si ferma, si
fermano insieme — ed è già successo, quando un abbonamento non si è addebitato.

**Una sola VPS** regge backend, dieci scraper e dieci browser.

### D.8 Le sessioni scadono senza preavviso

Si scopre che una sessione è morta **quando serve**, cioè in mezzo alla
quotazione di un cliente. Non c'è un rinnovo preventivo.

### D.9 Non c'è storia, quindi non ci sono numeri

Il pannello dice **come sta adesso** una fonte, non quante volte è caduta questo
mese. Non si sa quale compagnia vince più spesso, né quanto dura in media una
sessione. Ogni decisione su dove investire è a sensazione.

### D.10 Un preventivo interrotto è perso

Chiudi la pagina a metà del wizard e ricominci da sette schermate.

---

## PARTE E — Le regole che tengono in piedi tutto

Nate da guasti veri. Chi propone modifiche deve conoscerle.

| regola | il guasto da cui viene |
|---|---|
| **Il freno**: dopo 3 accessi falliti si smette | 172 tentativi in una notte; le compagnie bloccano l'utenza |
| **Le rotte si riconoscono per il nome intero** | `'/logindump'.startsWith('/login')` è vero: chiedere una diagnostica eseguiva un login **e toglieva il freno** |
| **Niente dati di clienti verso il browser** | le fotografie uscivano crude: password, targhe, date di nascita |
| **«Fatto» non si dice a vuoto** | risposte «ok» con tutti i campi vuoti, perché il portale aveva cambiato le etichette |
| **Il colore non è mai l'unico segnale** | chi non distingue i colori deve poter lavorare |
| **Gli importi si scrivono in un posto solo** | «€ 807.00» in una schermata e «807,00 €» in un'altra: la differenza fra ottocentosette euro e ottocentosette centesimi |
| **Un avviso si dà una volta sola** | la vigilanza ripeteva lo stesso allarme ogni 5 minuti |
| **Ogni prova nuova va fatta fallire sul codice di prima** | una prova che passa sia prima sia dopo non sorveglia niente |

---

## PARTE F — Come si collauda

```bash
npx http-server -p 8077 &  &&  node ui-test.mjs        # QUOTO, 177 prove
node scraper/verifica/controlla.mjs                    # scraper, 7 suite
node server/fontiWatchdog.test.mjs                     # la vigilanza
node server/fontiWatchdogSilenzio.test.mjs             # gli avvisi ripetuti
node server/fontiSonda.test.mjs                        # le sonde in parallelo
node server/hdiApi.test.mjs                            # il collegamento HDI
node withus-one/verifica/controlla.mjs                 # With Us One, 14
cd ../agente-sospesi && node controlla-tutto.mjs       # IAM, 15
```

Nessuna chiamata esce verso le compagnie: Supabase e le API sono finti, la rete
è bloccata.

**Una suite rossa non si pubblica.** Se una prova è rossa su codice corretto, è
la prova a essere sbagliata: pretendeva il *mezzo* invece del *fine*.

---

## PARTE G — Documenti collegati

| file | contenuto |
|---|---|
| `ECOSISTEMA.md` | struttura, grafica e regole di lavoro |
| `FONTI.md` | il sottosistema fonti, in dettaglio |
| `QUOTATORE-AUTO.md` | il preventivatore auto |
| `HDI-API.md` | le API ufficiali HDI |
| `UNIFICAZIONE.md` | perché i rami sono due e come si uniscono |
| `SNELLIRE.md` | 39 proposte verificate per alleggerire |
| `scraper/FORTIFICAZIONE.md` | 24 lacune degli scraper |
