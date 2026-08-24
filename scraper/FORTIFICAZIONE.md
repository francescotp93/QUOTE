# FORTIFICAZIONE DEGLI SCRAPER — progetto di lavoro

Documento di architettura, 02/08/2026. Riguarda i tre scraper (`allianz`, `italiana`,
`moto`), il modulo condiviso `scraper/comune/`, il backend `server/fonti.js` +
`server/moto.js` e il Pannello Fonti in `index.html`.

Non è un elenco di buone intenzioni: ogni voce ha il punto esatto del codice, che
cosa succede oggi e che cosa deve succedere domani. Chi prende in mano un lotto
deve poter scrivere il codice senza fare altre domande.

**Vincoli di progetto, non negoziabili.**

1. **Nessuna dipendenza nuova.** Ogni scraper fa `npm install` per conto suo e il
   deploy è un `git pull`: aggiungere un pacchetto significa installarlo tre
   volte e romperlo una volta. Si usa solo quello che c'è: Node, i suoi moduli
   interni (`crypto`, `fs`, `http`, `path`) e Playwright dove serve davvero.
2. **Quello che è comune va in `scraper/comune/`**, con la stessa regola di
   `freno.mjs`: moduli **puri**, senza Playwright e senza rete. Dove serve
   toccare il disco o l'orologio, quelle due funzioni si passano da fuori.
3. **Quello che è specifico di un portale resta nel suo scraper.** In `comune/`
   non entra mai un selettore CSS di una compagnia.
4. **Ogni pezzo deve essere provabile senza portali veri.** Se un modulo ha
   bisogno della rete per essere provato, è progettato male: si spezza in una
   parte pura (che si prova) e in una parte di contatto (che si legge).
5. **Italiano ovunque**, e i commenti spiegano il *perché*, non il *cosa*.

---

## 0. Metodo — quanti casi sono caduti in verifica e perché ci si può fidare del resto

Il censimento è partito da **31 segnalazioni**. Ognuna è passata da una verifica
avversariale: aprire il file, leggere le righe citate, e soprattutto **cercare la
copertura** — un `try/catch`, una guardia, un ramo più a monte che rende il caso
irraggiungibile. Chi verifica ha il compito di far cadere il caso, non di
confermarlo.

**Sono caduti 10 casi.** Non per dettagli, ma per motivi che vale la pena
elencare perché sono lo stesso identico errore ripetuto:

| Perché è caduto | Esempi |
|---|---|
| **La copertura c'era già** | Italiana `/auto` che scrive la targa nel form di login: a `italiana:225-228` c'è già `if (isLoginUrl(...) \|\| await hasPasswordField()) { await ensureLogin(); ... }`. Il caso grave è gestito; resta solo il ramo 404/home. |
| **La copertura c'era già (2)** | «Ogni fallimento è raccontato come credenziali non valide»: `tentaLogin(perche)` accetta il motivo, e il keep-alive — cioè proprio il percorso citato — passa `'sessione caduta e ri-login non riuscito'` (allianz:319, italiana:336). Il messaggio fisso è solo il default. |
| **Il percorso è morto** | `POST /moto/preventivo` e `POST /moto/lookup` non sono chiamati da nessun punto di `index.html`; `GET /fonti/:id/preventivo` inoltra a una rotta che lo scraper Italiana non ha mai avuto. Difetti veri su codice che oggi nessuno esegue. |
| **Il meccanismo era sbagliato** | La password nei dump di `/auto` e `/lookup`: fra il riempimento del campo e `richDump()` c'è sempre una `page.goto` che ricrea il DOM. Resta solo `/otpdump`, dove `fill` e `dump` sono adiacenti. |
| **Il danno non era quello** | Moto senza serializzazione: l'esito *dominante* della collisione col keep-alive è un preventivo **vuoto** (visibile), non un prezzo sbagliato. Il prezzo di un altro cliente richiede due agenti simultanei. Grave lo stesso, ma per un'altra ragione. |
| **La conclusione non reggeva** | «La fonte resta ferma per sempre»: sulla stessa card c'è il bottone **Verifica accesso** che sblocca davvero. Il difetto è il testo che indica il bottone sbagliato, non un vicolo cieco. |
| **Il crash-loop non esiste** | «Riavvii ogni 5 secondi = tentativi di login a raffica»: se Chromium non parte il processo muore a `allianz:79`, **prima** della riga 196 che fa il login. Il caso più probabile è proprio quello che non genera traffico. |
| **Il backup c'era** | `fonti.store.json` è nel backup giornaliero (`server/backup.js:72`), 14 copie. La perdita non è irreversibile. |
| **Il gate c'era** | Tutto `fontiRouter` è dietro `SUPER_ADMIN_EMAIL` (`fonti.js:87-90`): l'unico destinatario dei dump è il proprietario delle credenziali. |
| **Serve una shell sulla VPS** | `/otpdump`, `/logindump`: i tre telecomandi ascoltano su `127.0.0.1` e non sono proxati da `fonti.js`. Chi ci arriva legge già `fonti.store.json` e `FONTI_SECRET`. |

**Perché ci si può fidare di quello che resta.** I casi sopravvissuti hanno tutti
e tre queste proprietà:

- **il punto esatto è stato aperto e letto**, non dedotto (ogni voce della
  tabella §1 cita file:riga e la riga è stata verificata su disco oggi);
- **la copertura è stata cercata e non c'è** (`grep` di `locked|CHAIN` su
  `moto/quote-service.mjs` → nessun risultato; `grep` di `server.on('error'` su
  `scraper/` e `server/` → nessun risultato; `grep` di `totpCode` su
  `allianz/quote-service.mjs` → una sola occorrenza, la definizione);
- **il percorso arriva a qualcuno**: o a un preventivo consegnato, o al pallino
  del pannello, o a un file su disco. I casi che finivano in una textarea
  diagnostica sotto gli occhi del Super Admin sono stati declassati, non
  eliminati.

Due verifiche eseguite, non ragionate:
`node -e "console.log('/logindump'.startsWith('/login'))"` → **true** (il ramo
`/logindump` è codice morto in due scraper su tre);
lettura dei tre `.service`: in `allianz` e `italiana` la riga `FONTI_SECRET` è
**commentata**, mentre `server/deploy/withus-backend.service` ha
`EnvironmentFile=.../server/.env` — cioè le due chiavi possono divergere davvero.

---

## 1. I buchi, in ordine di gravità

Ordine: prima quelli che fanno uscire un **dato sbagliato** verso un cliente o un
collaboratore; poi quelli che fanno **dire «fatto» a chi non ha fatto niente**;
poi privacy; poi robustezza del processo.

| # | Caso | Dove (file:riga) | Che cosa succede oggi | Gravità |
|---|---|---|---|---|
| **1** | **Moto: nessuna serializzazione.** Allianz e Italiana hanno `locked()` (allianz:241-242, italiana:280-281); il moto no. | `scraper/moto/quote-service.mjs:302` (keep-alive `setInterval` con `page.goto(PORTAL)` sulla stessa `page`) contro `:219-246` (gli handler `/quote`, `/lookup`, `/map`) | Un `/quote` dura 30-90 s (due `waitForFunction` da 80 s + attese fisse) dentro una finestra di 240 s. Quando il keep-alive cade a metà quotazione, la pagina dei risultati viene distrutta: `readResult()` (`:146`) legge la home, `premio_totale` esce **null**, `tuttiPrezzi` raccoglie i prezzi vetrina. Con due agenti che quotano insieme è peggio: `:38` fa `about:blank` e riparte, il primo si risveglia sul risultato **del cliente dell'altro** e lo restituisce sotto la propria targa. Nessuna eccezione: i passi hanno tutti `.catch(()=>{})`. `server/moto.js:80` risponde `ok:true`. | **alta** |
| **2** | **Il preventivo moto dichiara garanzie e franchigia che il portale non ha preso.** | `server/moto.js:75` (`['Rinuncia alla rivalsa'].concat(...)`, stringa fissa) e `:78` (`se: d.input?.se`, l'eco della richiesta); sorgenti: `scraper/moto/quote-service.mjs:70` (`return 'no-control'`), `:96` (`{set:false}` mai controllato a `:236`), `:141` (`catch { log('setSE:', ...) }`) | `setRivalsa` aggancia il dropdown per **testo** (`tfh-ui-select` che contiene «rinuncia alla rivalsa»): se 24H rinomina l'etichetta torna `'no-control'` e il flusso prosegue. `setSE` ingoia l'eccezione e prosegue. Il premio viene calcolato con i **default del portale**, ma la risposta dichiara la rinuncia inclusa (anche quando è stata chiesta `rivalsa=no`) e il SE **chiesto**, non quello letto. L'agente vende una clausola che la polizza non ha; il conto arriva al primo sinistro con conducente non abilitato. | **alta** |
| **3** | **Fastquote: se il 24H rinomina un campo, `/quote` risponde 200 con un preventivo vuoto.** | `scraper/moto/quote-service.mjs:44-49` (`waitForSelector`, `fill`×2, `click`, `waitForFunction` — **tutti** con `.catch(()=>{})`) e `:245-246` | Nessun punto di contatto col portale può sollevare: la `waitForFunction` scade in silenzio dopo 80 s e il codice prosegue su `continuaGaranzie`/`setSE`/`readResult`. Esce 200 con `premio_totale: null`, `garanzie_incluse: []`, `veicolo: null` e **nessun campo `error`** — che è esattamente ciò che `server/moto.js:67` controlla, quindi promuove a `ok:true`. Nei log si vede solo un `setRivalsa: controllo non trovato` di rimbalzo: niente dice «il campo targa non c'è più». | **alta** |
| **4** | **Allianz: `loggato` è un test sull'URL, non sulla sessione.** | `scraper/allianz/quote-service.mjs:250` (`loggato: onPortal()`), `:87` (`onPortal = () => /portaleagenzie\.allianz/i.test(page.url())`), `:317` (keep-alive: solo `isLoginUrl(page.url())`); consumato in `server/fonti.js:120` | Una pagina «Servizio temporaneamente non disponibile» o «Sessione scaduta» servita con **HTTP 200** sul dominio del portale passa tutti i controlli: l'URL è giusto. `/status` dice `loggato:true` senza toccare la pagina; `fonti.js:120` traduce in `'attiva'`; il pannello disegna il **pallino verde** «Dentro al programma: tutto ok». Il keep-alive logga «attività ok», non passa da `autoLogin`, quindi il freno non registra nulla. Nessuno se ne accorge finché una visura non torna vuota. | **alta** |
| **5** | **Allianz `/lookup`: guardia sull'URL vecchio, targa scritta nel primo input che trova, `ok:true` scritto a mano.** | `scraper/allianz/quote-service.mjs:288` (`if (!onPortal() && !(await ensureLogin()...))`), `:216` (`page.goto(INQUIRY).catch(()=>{})`), `:223` (`if (!el) el = ins[0]`), `:293` (`return { ok: true, ... }`) | La guardia legge l'URL **lasciato dal keep-alive**, non lo stato della sessione: a sessione morta lato server passa e non si tenta login. A freno tirato è peggio: il keep-alive esce a `:309` senza navigare, quindi l'URL resta congelato sul portale e `/lookup` passa la guardia anche con la fonte mostrata **rossa** nel pannello. Poi `cercaTarga` ingoia l'errore del `goto` (`:216`): se la navigazione fallisce o va in timeout a 45 s **resta la pagina di prima**, cioè il risultato ANIA della targa interrogata poco fa. Il codice compila comunque (`ins[0]`, che sulla pagina SSO è `Ecom_User_ID`), attende 3 secondi fissi e risponde `ok:true` con la targa **chiesta** in etichetta. `fonti.js:198-199` inoltra verbatim, `index.html:8283` stampa `"ok": true`. | **alta** |
| **6** | **`/logindump` non esiste: è mangiata da `/login`.** | `scraper/allianz/quote-service.mjs:252` prima di `:260`; `scraper/italiana/quote-service.mjs:291` prima di `:299` | `'/logindump'.startsWith('/login')` è **true** (verificato eseguendolo). Chi chiama la diagnostica ottiene il comportamento di `/login`: `FRENO.sblocca()` (allianz:255, italiana:294) — che azzera fallimenti, blocco e attesa — e poi `ensureLogin()`, cioè un **accesso vero** al portale con le credenziali vecchie. Lo strumento che serve proprio quando il portale è cambiato non funziona, e ogni chiamata brucia un tentativo **e toglie il freno dall'esterno**. Tre-quattro curl mentre si indaga riproducono la raffica per cui il freno è stato scritto. | **alta** |
| **7** | **Il segreto TOTP viene accettato, mostrato «✅ salvato», e non lo usa nessuno.** | `scraper/allianz/quote-service.mjs:67` (`totpCode` definita — `grep` dà **una sola** occorrenza) e `:154` (usa solo `c.codice`); `server/fonti.js:269` (la `PUT` destruttura `{nome,url,username,password,has2fa,ruolo,note,attiva}`: `totp_secret` cade); `index.html:7831-7833` e `:7913` | Per Allianz il segreto viene cifrato, `/status` ritorna `ha_totp:true` e il pannello scrive «SEGRETO TOTP · ✅ salvato»; `autoLogin` non lo guarda mai. L'intestazione del file (`allianz:8`) promette il contrario. Per i portali custom è peggio: `index.html:8017` mette `totp_secret` nel body, la `PUT` lo **scarta in silenzio**, si risponde `ok:true` e il pannello scrive «Salvato ✓». Chi ci crede smette di presidiare i codici Duo; alla prima scadenza partono i tre tentativi falliti e la fonte si blocca mentre nessuno la sta guardando. | **alta** |
| **8** | **Credenziali non decifrabili = credenziali «assenti», e il freno blocca con la diagnosi sbagliata.** | `scraper/allianz/quote-service.mjs:49` (`catch { return '' }`) e `:56` (`catch { return {username:'',...} }`); identico in `italiana:46` e `:63`; `:142`/`:127` → `:179`/`:185` | `dec()` ingoia qualunque errore e ritorna stringa vuota; `creds()` ingoia lettura e parse. Da lì `autoLogin` logga «credenziali assenti nel Pannello Fonti», `tentaLogin` registra il fallimento con motivo **«accesso rifiutato: credenziali o codice Duo non più validi»**, e dopo tre giri la fonte è `'bloccata'` con quel motivo stampato nel pannello (`fonti.js:36` → `index.html:7882`). Il caso non è teorico: nei due `.service` degli scraper `FONTI_SECRET` è **commentata** mentre il backend la prende da `server/.env` — chiavi diverse, `authTag` GCM che non torna, `dec()` che tace. Nel frattempo `GET /fonti` (che decifra con la chiave *giusta* del backend) mostra utente e `ha_password` corretti: la contraddizione è perfetta e manda a cambiare una password valida. | **alta** |
| **9** | **«Accedi col codice» non toglie il freno, e il pannello dice che è l'unica cosa che lo toglie.** | `index.html:7879` (il testo) e `:8291-8303` (`accediConCodice`) contro `server/fonti.js:316-335` (`POST /:id/codice`: cifra, salva, `ok:true`, **nessuna fetch verso gli scraper**) e `allianz:255`/`italiana:294` (unico `FRENO.sblocca()`, raggiunto solo da `/verifica`) | Stato `bloccata`. Il pannello scrive: «Metti un codice nuovo e premi **Accedi col codice**: è l'unica cosa che lo fa ripartire». Il bottone salva il codice nel file e basta; l'alert dice «Lo scraper lo sta confermando». A freno tirato `nonPrimaDi = Infinity`, il keep-alive esce subito (`allianz:309`) e `tentaLogin` rifiuta: **nessuno guarderà mai quel codice**. Non è un vicolo cieco — «Verifica accesso» è 40 pixel più su e funziona — ma l'istruzione scritta manda dalla parte sbagliata e l'alert dichiara un lavoro mai avviato. | **alta** |
| **10** | **Italiana `/auto`: l'esito di `ensureLogin` non viene guardato, e i passi tornano `true` su una pagina qualsiasi.** | `scraper/italiana/quote-service.mjs:225-228` (`await ensureLogin()` con valore di ritorno scartato, poi `goto` senza ricontrollo), `:233` (primo input di testo visibile), `:245-249` (primo elemento con dentro `svg,i,img`) | Il caso «pagina di login» è coperto a monte (`:225`), ma se il secondo `goto` atterra su una 404 o sulla home — il percorso `'/auto'` è **indovinato**, `base` viene da `origin(loginUrl)` — si scrive la targa nel primo input visibile (la barra di ricerca) e si clicca il primo controllo iconato del suo contenitore. `steps.targa` e `steps.lente` tornano `true` e `fonti.js:167-169` li inoltra tali e quali: «campo compilato = sì» su un campo che non è quello. Confronto utile: `allianz:288` la guardia dopo la navigazione ce l'ha; qui manca. | **media** |
| **11** | **Scraper morto o irraggiungibile = pastiglia VERDE «Configurata».** | `server/fonti.js:47` e `:121` (`catch { return { stato: configurato ? 'pronta' : ... } }`) contro `:104` (`stato24h` per lo stesso guasto ritorna `'spento'`); reso da `index.html:7782` (`pronta:['#1c8a52','#e7f7ee','Configurata']`) | Il `catch` prende tutto: `ECONNREFUSED`, l'abort dopo 6 s, una risposta non-JSON, un 500. Siccome `configurato` è vero appena c'è un username salvato, il guasto diventa `'pronta'`, che nel pannello è **lo stesso verde di `attiva`**. Il pallino resta grigio (`fontiDot` accende il verde solo per `'attiva'`), quindi non è l'inganno pieno; ma «pronta» oggi significa «non lo so» e copre sia il servizio spento sia lo scraper su senza url. La rotta gemella del 24H fa la cosa giusta dieci righe sopra: non è una scelta, è una dimenticanza. | **media** |
| **12** | **Se muore il browser, il processo resta vivo: `Restart=always` non ha niente da riavviare.** | `scraper/allianz/quote-service.mjs:79-83` e `:327` (`await new Promise(()=>{})`); identico in `italiana:67-71`/`:343` e `moto:12-16`/`:304`. `grep` di `ctx.on('close'`, `page.on('crash'`, `isClosed()`, `process.exit` su tutti e tre → **zero risultati** | `launchPersistentContext` è chiamata una volta sola e nessuno sorveglia la chiusura. Se Chromium muore (OOM sulla VPS — tre browser non-headless con display virtuale — o riavvio del display), Node continua a vivere sul `Promise` che non si risolve e il server HTTP continua ad accettare richieste. `/status` di Allianz **non fa nessun await** sulla pagina (`page.url()` è un valore in cache): risponde 200 con l'ultimo URL noto e `loggato:true`, cioè il pannello resta **verde su uno scraper morto**. Italiana risponde `loggato:false` → arancione. I percorsi d'uso invece falliscono (502 nel pannello). | **media** |
| **13** | **Il freno vive solo in RAM, e la prima cosa dopo il riavvio è un tentativo di accesso.** | `scraper/comune/freno.mjs:40-43` (variabili di chiusura; nessuna scrittura su disco) + `allianz:196-197` e `italiana:203-204` (`loggedIn()` → `ensureLogin()` → `tentaLogin()` **prima** del `.listen` di `:300`/`:320`); riavvii da `deploy/autopull.sh:60` (`systemctl restart` a ogni giro del timer che tocchi la cartella) e da `Restart=always` | Il freno si è fermato e aspetta una persona. Il servizio riparte: `fallitiDiFila` torna a 0, `bloccato` a false, e si spende **subito** un tentativo senza che nessuno abbia messo un codice nuovo — poi altri due, fino a 3 in ~45 minuti. Soprattutto: nel pannello lo stato torna da `'bloccata'` a `'scaduta'` (`fonti.js:46`/`:120`), cioè **sparisce l'unica scritta che dice a Francesco che cosa fare**. (Il flood da crash-loop non è dimostrato: se Chromium non parte il processo muore prima della riga 196.) | **media** |
| **14** | **I dump portano fuori il valore dei campi e il testo della pagina ANIA.** | `scraper/allianz/quote-service.mjs:207` (`text: clean(e.innerText \|\| e.value)` applicato **anche agli `input`**) e `:209` (3000 caratteri di `innerText`), usati a `:280` (`/otpdump`, subito dopo aver riempito la password a `:275`) e `:293` (`_dump` dentro `/lookup`); identico in `italiana:213`; percorso completo `fonti.js:198-199` → `index.html:8283` | Per un `<input>` `innerText` è vuoto, quindi si legge `e.value`: il filtro di `:208` lo tiene perché il campo ha `name`. Su `/otpdump` la password compare nel JSON **se il submit non ha navigato** — cioè esattamente il caso in cui si usa quella diagnostica. Sul lato clienti: `/lookup` restituisce 3000 caratteri di testo della pagina ANIA (proprietario, indirizzo, situazione assicurativa) che il backend inoltra **senza filtro** e il pannello scrive in una textarea il cui placeholder dice «copialo e mandamelo per tarare l'estrazione» (`index.html:7889`). Viola apertamente la dottrina scritta in `fonti.js:6` («I segreti NON vengono mai rimandati al browser»). | **media** |
| **15** | **Targhe (e date di nascita) nei log di sistema, schermate ANIA in chiaro su disco senza scadenza.** | `allianz:290` (`log('Interrogazione ANIA targa:', targa)`) e `:292` (`shots/lookup.png`, `fullPage`); `moto:233` (`log('Preventivo:', targa, nascita, ...)`) e `:255`/`:257`; più `shots/login.png` (allianz:257, italiana:296), `shots/otpdump.png` (:279), `shots/auto-step1.png` (italiana:276), `shots/current.png` | Il logger è `console.log` nudo (`allianz:37`): girando come servizi systemd le righe finiscono in journald con la retention **della macchina**, non con una scelta nostra. Gli screenshot sono a nome fisso (si sovrascrivono: resta esposto l'**ultimo** cliente, non uno storico) accanto a `userdata/`, senza cifratura né cancellazione. È l'unico posto del sistema dove dati personali stanno a riposo in chiaro, mentre le credenziali sono cifrate con cura. Attenuante verificata: `shots/*.png` è ignorato in tutti e tre i `.gitignore`, quindi non finiscono nel repo. | **media** |
| **16** | **`load()`/`save()` di `fonti.store.json` non sono atomici e non distinguono «file assente» da «file rotto».** | `server/fonti.js:83` (`catch { return {} }`) e `:84` (`fs.writeFileSync` diretto sul file finale) | Un file troncato o illeggibile diventa **silenziosamente** un archivio vuoto; la prima scrittura successiva salva `{}` più il solo record toccato, cancellando le altre compagnie, e risponde `ok:true`. La concorrenza interna non è la causa (Node monothread, gli handler vanno da `load` a `save` senza `await`, e gli scraper aprono il file solo in lettura): servono un disco pieno, un crash a metà scrittura o una modifica a mano. Il backup c'è (`backup.js:72`, 14 copie giornaliere), quindi non è irreversibile — ma la perdita è muta. | **media** |
| **17** | **Il backend non guarda mai lo stato HTTP dello scraper.** | `server/fonti.js:167-169`, `:183-185`, `:197-199` (`await r.json().catch(()=>({}))` + `res.json(d)`, mai `r.ok`, mai il content-type); lato scraper il fallback risponde **200** con la lista endpoint: `allianz:298`, `italiana:318`, `moto:298` | Un 500 dello scraper (`italiana:319`) viene inoltrato come **200** con dentro l'oggetto errore; una risposta non-JSON diventa **200 con `{}`**. E siccome i tre servizi si riavviano separatamente a ogni `git pull`, la finestra in cui il backend è nuovo e lo scraper è vecchio esiste a ogni rilascio: una rotta che non c'è più risponde 200 con `{"endpoints":[...]}`. Confronto: `server/moto.js:68` e `:109` il controllo `(!r.ok \|\| d.error)` ce l'hanno. Oggi i consumatori sono textarea diagnostiche del Super Admin, quindi il messaggio arriva a schermo: il difetto è latente, ma è la fondazione su cui poggiano i casi 1-3. | **media** |
| **18** | **Nessun gestore d'errore su `listen` e sul lancio del browser; le unit systemd non hanno `StartLimit`.** | `allianz:300`, `italiana:320`, `moto:300` (`.listen(porta,'127.0.0.1',cb)` senza `server.on('error')`) e `allianz:79`, `italiana:67`, `moto:12` (top-level `await` senza `try/catch`); `scraper/*/deploy/*.service:9-10` (`Restart=always`, `RestartSec=5`, nessun `StartLimit*`) | Su `EADDRINUSE` Node emette `'error'` su un EventEmitter senza ascoltatori: eccezione non gestita, processo giù, systemd riparte ogni 5 s — e con 2 avvii ogni 10 s contro un default di 5 il limite **non scatta mai**, quindi l'unit non finisce mai in `failed` e nessuno riceve una notifica. Causa concreta documentata: `scraper/moto/restart.sh:11` lancia lo scraper con `setsid nohup` **fuori** da systemd. Idem per il lancio del browser: se Xvfb non c'è o il profilo `userdata/` è ancora bloccato, la promessa viene rifiutata e nel log non compare il motivo vero. | **media** |
| **19** | **`/otpdump` manda utente e password al portale scavalcando il freno.** | `scraper/allianz/quote-service.mjs:269-283` (rifà a mano `goto` + `fillFirst`×2 + `submitForm` senza interrogare `FRENO`); il test che sorveglia il freno conta solo `await autoLogin()` (`scraper/verifica/scraper-freno.test.mjs:51`) | Il commento a `allianz:164` dichiara che `tentaLogin` è «l'UNICA porta da cui passa un tentativo di accesso»: non è vero, e il test non se ne accorge. È un accesso vero con credenziali vere che il freno non conta e non può fermare, anche a fonte già bloccata. Serve una shell sulla VPS (colpo singolo umano, non un ciclo), quindi non è il difetto che il freno doveva chiudere — ma la promessa scritta nel codice va resa vera, altrimenti domani qualcuno ci si appoggia. | **bassa** |
| **20** | **`scraperUrlFor` instrada per sottostringa `itali`.** | `server/fonti.js:20-24` (`/itali/.test(id + ' ' + nome)`), usata a `:130`, `:158`, `:176`, `:227`; dall'altra parte `italiana:32` (`FONTE_ID` fisso) e `:51` (ripiega sul primo record il cui nome matcha `/italiana/i`) | Basta un secondo portale con «itali» nel nome («Vittoria Italiana», «Reale Italia», o l'id generato `c-italiana-2`) perché tutte le chiamate finiscano sulla porta 4300, e lo scraper dall'altra parte non verifica **quale** portale gli è stato chiesto. Il pannello mostrerebbe per quel portale lo stato della sessione dell'**altro**, e le sue credenziali — salvate e cifrate correttamente — non verrebbero mai usate. Il caso generale (compagnia diversa) è gestito: `scraperUrlFor` torna null e si risponde 404. | **bassa** |
| **21** | **Il motivo di default del freno accusa le credenziali anche quando il guasto è locale.** | `allianz:179` e `italiana:185` (`perche \|\| 'accesso rifiutato: credenziali o codice ... non più validi'`), usato dai percorsi di avvio (`allianz:190`) e da `/login` (`allianz:256`) | Il keep-alive un motivo suo lo passa (caso caduto in verifica), ma i due percorsi che restano — login di boot e `/login` manuale — usano il default. Combinato col caso **8** (credenziali illeggibili) produce la diagnosi peggiore possibile: «cambia la password» quando la password è giusta. | **bassa** |
| **22** | **`DELETE` di un portale e delle sue credenziali rispondono sempre «fatto».** | `server/fonti.js:286` e `:311` (`save(store)` con il valore di ritorno ignorato, poi `res.json({ok:true})`), contro `:261`, `:279`, `:304`, `:333` che il controllo lo fanno | `save()` ritorna `false` su qualunque errore di scrittura e lo ingoia. Le due `DELETE` confermano comunque. È il gesto che si fa quando una compagnia revoca un'utenza, ed è il tipo di cosa che poi si dichiara per iscritto. Attenuante: `eliminaFonte` (`index.html:8147`) ricarica subito l'elenco, quindi una scrittura fallita si vede; e `DELETE /:id/credenziali` non è chiamata da nessun punto del pannello. | **bassa** |
| **23** | **Moto `/lookup`: `ok:true` con veicolo a campi tutti null.** | `scraper/moto/quote-service.mjs:261` (`ok:true` incondizionato) e `server/moto.js:110` (il ramo scraper non controlla `veicolo.descrizione`, mentre il ramo Openapi a `:97` lo fa) | Targa estera, ciclomotore fuori banca dati, sessione 24H caduta: `readVeicolo` restituisce **sempre** un oggetto, con i campi non trovati a null. Il vuoto è visibile (non è un veicolo sbagliato: `:38` fa `about:blank` prima del fastquote proprio per evitarlo), ma chi pre-compila il wizard riempie a mano «a occhio» e sbaglia la classe di rischio. Oggi la rotta è morta: `POST /moto/lookup` non è chiamata da `index.html`. | **bassa** |
| **24** | **Il fallback dei tre telecomandi risponde 200 a qualunque percorso sconosciuto.** | `allianz:298`, `italiana:318`, `moto:298` (`res.end(JSON.stringify({endpoints:[...]}))` senza `statusCode`) | Una versione vecchia dello scraper interrogata su una rotta nuova risponde **successo vuoto** invece di 404. Da solo non fa danno (è la metà servente del caso 17), ma è la ragione per cui uno sfasamento di deploy non si vede. | **bassa** |

---

## 2. I moduli comuni da costruire

Sette moduli in `scraper/comune/`, tutti con le regole di `freno.mjs`: **nessun
import da npm**, **nessuna rete**, **nessun Playwright**, e ogni dipendenza dal
mondo esterno (orologio, disco) passata come argomento. Le prove vivono in
`scraper/verifica/` con lo stesso stile già in uso (`prova` / `deve`,
`process.exit(ko === 0 ? 0 : 1)`): si lanciano con `node`, senza framework.

> **Nota di stile obbligatoria.** Ogni modulo si apre con un commento che
> racconta *il difetto che ha causato la sua nascita*, come fa `freno.mjs:1-21`.
> Fra sei mesi quel commento è l'unica cosa che impedirà a qualcuno di
> «semplificare» il modulo togliendogli la ragione di esistere.

---

### 2.1 `scraper/comune/coda.mjs` — una cosa per volta sulla pagina

**A che serve.** Chiude il caso **1** (moto senza serializzazione) e mette in
comune quello che oggi è copiato a mano in due scraper su tre (`allianz:241-242`,
`italiana:280-281`). In più aggiunge le due cose che il `locked()` di oggi non
ha: il keep-alive deve poter **saltare il giro** se la catena è occupata, e
un'operazione appesa non deve bloccare tutte le successive per sempre.

**Interfaccia esatta.**

```js
export function creaCoda(opzioni = {}) → coda
// opzioni.attesaMax  (ms, default 180000) oltre i quali un'operazione è considerata appesa
// opzioni.orologio   () => ms, default Date.now  — iniettabile per le prove
// opzioni.ritardo    (ms) => Promise, default setTimeout — iniettabile per le prove

coda.esegui(nome, fn)      // → Promise con il risultato di fn(); mette in fila
coda.provaAdEseguire(nome, fn) // → Promise<{eseguito:boolean, valore?}>; se occupata NON accoda: torna {eseguito:false}
coda.occupata()            // → boolean
coda.stato()               // → { occupata, nome, da_quanti_ms, in_attesa }
```

Regole di comportamento che le prove devono imporre:

- `esegui` mantiene l'ordine di arrivo, e **un fallimento non rompe la catena**
  (è il motivo del `CHAIN.then(fn, fn)` di oggi: va conservato).
- `provaAdEseguire` è quello che usa il keep-alive: **mai** accodarsi dietro una
  quotazione in corso, perché quando toccherebbe a lui la quotazione è finita e
  navigare via non serve più a niente.
- se un'operazione supera `attesaMax`, `stato().da_quanti_ms` lo dice e la coda
  logga; **non** la si uccide (non possiamo interrompere una `page.evaluate` da
  qui), ma il chiamante ha l'informazione per rispondere «sono occupato» invece
  di restare appeso.

**Come si prova senza rete** — `scraper/verifica/coda.test.mjs`:

```js
const coda = creaCoda({ orologio: () => finto, ritardo: () => Promise.resolve() });
// 1. due esegui() concorrenti non si sovrappongono: ognuno scrive in un array
//    all'inizio e alla fine, e la sequenza attesa è A-inizio,A-fine,B-inizio,B-fine.
// 2. il primo che lancia un'eccezione non impedisce al secondo di partire.
// 3. mentre A è in corso, occupata() è true e provaAdEseguire() torna {eseguito:false}
//    SENZA aver chiamato la funzione (contatore a 0).
// 4. finito A, provaAdEseguire() torna {eseguito:true}.
// 5. con l'orologio finto avanzato oltre attesaMax, stato().da_quanti_ms lo riporta.
```
Le funzioni di prova sono `() => new Promise(res => risolvi = res)`: si controlla
la concorrenza a mano, senza timer veri e senza aspettare.

---

### 2.2 `scraper/comune/esito.mjs` — il silenzio non è successo

**A che serve.** È il modulo che chiude, come regola generale, i casi **3**,
**5**, **10**, **23**, **24**: oggi ogni scraper decide da sé che forma dare a
una risposta, e il default è `ok:true`. Qui si stabilisce che `ok:true` **non si
può scrivere a mano**: si ottiene solo costruendo un esito riuscito, e un esito
riuscito richiede dei dati.

**Interfaccia esatta.**

```js
export const CODICI = {
  CAMPO_ASSENTE:      'campo-non-trovato',      // il portale ha cambiato un id/etichetta
  PAGINA_INATTESA:    'pagina-inattesa',        // siamo altrove (login, 404, manutenzione)
  PORTALE_MUTO:       'portale-non-risponde',   // timeout/rete
  RISULTATO_ASSENTE:  'risultato-non-letto',    // arrivati in fondo senza il dato
  NON_COERENTE:       'risultato-non-coerente', // il dato letto non è quello chiesto
  FRENO_TIRATO:       'freno-tirato',
  BROWSER_MORTO:      'browser-non-disponibile',
  OCCUPATO:           'occupato',
  ROTTA_SCONOSCIUTA:  'rotta-sconosciuta',
  RICHIESTA_ERRATA:   'richiesta-errata',
};

export function riuscito(dati)                        // → { ok:true, dati }
export function fallito(codice, messaggio, dettagli)  // → { ok:false, errore:{codice,messaggio,dettagli} }
export function eEsito(x)                             // → boolean (è già un esito?)
export function statoHttp(esito)                      // → 200 | 400 | 404 | 409 | 502 | 503
export function esigi(condizione, codice, messaggio, dettagli)
   // se la condizione è falsa LANCIA un ErroreEsito; altrimenti non fa niente
export class ErroreEsito extends Error { constructor(codice, messaggio, dettagli) }
export function daEccezione(e)  // → esito fallito; riconosce ErroreEsito e ci mette dentro il codice giusto
```

Mappa `statoHttp` (decisa qui una volta per tutte, così i tre scraper e il
backend non litigano):

| codice | HTTP | perché |
|---|---|---|
| — (riuscito) | 200 | |
| `RICHIESTA_ERRATA` | 400 | manca la targa: colpa del chiamante |
| `ROTTA_SCONOSCIUTA` | 404 | e così uno sfasamento di deploy **si vede** |
| `FRENO_TIRATO`, `OCCUPATO` | 409 | «riprova»: non è un guasto, è un no adesso |
| `CAMPO_ASSENTE`, `PAGINA_INATTESA`, `PORTALE_MUTO`, `RISULTATO_ASSENTE`, `NON_COERENTE` | 502 | il guasto è a valle, nel portale |
| `BROWSER_MORTO` | 503 | il guasto è nostro, e passerà con un riavvio |

**Come si prova** — `scraper/verifica/esito.test.mjs`: pura tabella. `riuscito`
senza dati deve lanciare (non esiste un successo vuoto); `fallito` senza
messaggio deve lanciare (non esiste un errore muto); `statoHttp` su ognuno dei
codici; `esigi(false, ...)` lancia un `ErroreEsito` con il codice giusto e
`daEccezione` lo riconverte; `daEccezione(new Error('boom'))` produce un esito
fallito con un codice generico e il messaggio conservato.

---

### 2.3 `scraper/comune/rotte.mjs` — `/logindump` non è `/login`

**A che serve.** Chiude il caso **6** (il ramo diagnostico è codice morto in due
scraper) e il **24** (il fallback risponde 200). Oggi il routing è una catena di
`startsWith` e l'ordine decide chi vince: è un difetto che si ripresenterà ogni
volta che si aggiunge una rotta.

**Interfaccia esatta.**

```js
export function creaRotte(tabella) → rotte
// tabella: { '/status': fn, '/login': fn, '/logindump': fn, '/lookup': fn, ... }
// Le chiavi sono percorsi ESATTI. Per un prefisso volontario si scrive '/shot/*'.

rotte.trova(pathname)   // → { percorso, gestisci } | null   — confronto esatto, poi i soli '/x/*'
rotte.elenco()          // → ['/status','/login',...]  (per il messaggio di 404)
```

Regola: **il confronto esatto vince sempre sul prefisso**, e un prefisso deve
essere dichiarato con `/*`. Così `/logindump` non può più essere mangiata da
`/login` nemmeno se qualcuno riordina i rami.

**Come si prova** — `scraper/verifica/rotte.test.mjs`: solo stringhe, nessun
`http`.
- `trova('/logindump')` restituisce il gestore di `/logindump`, **non** quello di
  `/login` (è la prova che sorveglia il difetto di oggi: va scritta con questo
  nome);
- `trova('/login')` → `/login`;
- `trova('/status?x=1')` → il chiamante passa già `u.pathname`, quindi si prova
  anche che `trova('/status/')` funzioni (barra finale tollerata);
- `trova('/inventata')` → `null`;
- con `'/shot/*'` in tabella, `trova('/shot/current')` trova, `trova('/shotx')` no;
- una tabella con due chiavi che si sovrappongono in modo ambiguo deve **lanciare
  alla creazione**, non al primo uso.

---

### 2.4 `scraper/comune/segreti.mjs` — «vuoto» e «non decifrabile» sono due cose diverse

**A che serve.** Chiude il caso **8**, che è il più insidioso di tutti perché
produce una diagnosi *attivamente falsa*. Usa solo `crypto`, che è un modulo
interno di Node: nessuna dipendenza nuova, nessuna rete.

**Interfaccia esatta.**

```js
export function creaCassaforte(segreto) → cassaforte
cassaforte.cifra(testo)   // → 'v1:...'  (stesso formato di oggi: iv|tag|ct in base64)
cassaforte.decifra(blob)  // → { stato: 'vuoto' | 'ok' | 'illeggibile', valore: string, motivo: string|null }

export function leggiCredenziali(testoJson, estrai) → {
  stato: 'ok' | 'archivio-illeggibile' | 'fonte-assente' | 'chiave-sbagliata',
  credenziali: { username, password, codice, totp, loginUrl },
  motivo: string|null,
  campiIlleggibili: string[],
}
// `testoJson` è il contenuto del file, letto dal chiamante (il modulo non tocca il disco).
// `estrai` è una funzione (store) => record: la parte specifica di ogni scraper
//   (allianz: store.allianz; italiana: la ricerca in store.__custom).
```

Il punto che cambia tutto: **`decifra` non ritorna più stringa vuota per due
motivi diversi**. `'vuoto'` è «il campo non c'era»; `'illeggibile'` è «c'era, ma
la chiave non lo apre» — quasi sempre `FONTI_SECRET` diversa fra backend e
scraper. E `leggiCredenziali` distingue «archivio illeggibile» (file rotto o
assente) da «chiave sbagliata» (file buono, blob che non si aprono).

**Chi lo usa e come cambia il comportamento** (vedi §3): quando lo stato non è
`'ok'`, `autoLogin` **non deve nemmeno provare** e il fallimento **non deve
contare** fra i tre del freno, perché non è un rifiuto della compagnia: è un
guasto nostro. Il motivo che arriva al pannello diventa «le credenziali salvate
non si aprono con la chiave di questo servizio (FONTI_SECRET diversa dal
backend?)», che è una frase che porta alla soluzione in un minuto.

**Come si prova** — `scraper/verifica/segreti.test.mjs`, tutto in memoria:
- `creaCassaforte('A').cifra('pippo')` poi `decifra` con la **stessa** chiave →
  `{stato:'ok', valore:'pippo'}`;
- lo stesso blob decifrato da `creaCassaforte('B')` → `{stato:'illeggibile'}` e
  **non** `''` (è la prova che sorveglia il difetto di oggi);
- `decifra('')` e `decifra(undefined)` → `{stato:'vuoto'}`;
- `decifra('v1:non-base64-valido')` → `{stato:'illeggibile'}` senza lanciare;
- `decifra('testo in chiaro senza prefisso')` → `{stato:'vuoto'}` (compatibilità
  con i record vecchi: si comporta come oggi, ma lo dichiara);
- `leggiCredenziali('{ questo non è json', ...)` → `'archivio-illeggibile'`;
- archivio valido ma senza la fonte → `'fonte-assente'`;
- archivio valido, fonte presente, blob cifrati con un'altra chiave →
  `'chiave-sbagliata'` con `campiIlleggibili: ['username','password']`.

---

### 2.5 `scraper/comune/diagnosi.mjs` — dire perché, non dire una cosa a caso

**A che serve.** Chiude i casi **21** e la metà «messaggio» dell'**8**, e serve
alle correzioni del **4** (pagina di cortesia servita a 200). È la funzione che
trasforma quello che si è osservato in un motivo scrivibile nel pannello.

**Interfaccia esatta.**

```js
export function classificaAccesso(osservato) → {
  causa,            // vedi tabella
  messaggio,        // frase italiana, pronta per il pannello
  contaComeFallimento, // se false, il freno NON deve spendere uno dei tre colpi
}
// osservato = {
//   credenziali: 'ok'|'archivio-illeggibile'|'fonte-assente'|'chiave-sbagliata',
//   erroreRete:  string|null,        // messaggio dell'eccezione della goto, se c'è
//   urlFinale:   string,
//   testoPagina: string,             // primi ~2000 caratteri, già letti dal chiamante
//   campoUtenteTrovato:   boolean,
//   campoPasswordTrovato: boolean,
//   campoCodiceTrovato:   boolean,
// }

export function eManutenzione(testo)      // → boolean
export function ePaginaDiLogin(url, haCampoPassword) // → boolean
export const SEGNI_MANUTENZIONE = [ /* espressioni regolari, vedi sotto */ ]
```

| causa | quando | conta come fallimento? |
|---|---|---|
| `credenziali-illeggibili` | `credenziali !== 'ok'` | **no** — guasto locale |
| `portale-irraggiungibile` | `erroreRete` valorizzato | **no** — non è un rifiuto |
| `portale-in-manutenzione` | `eManutenzione(testoPagina)` | **no** |
| `campi-non-trovati` | siamo su una pagina di login ma manca il campo utente o password | **no** — è il portale che è cambiato |
| `codice-rifiutato` | il campo codice c'era, l'abbiamo riempito, e siamo ancora sul login | **sì** |
| `credenziali-rifiutate` | tutto trovato e riempito, e siamo ancora sul login | **sì** |
| `esito-ignoto` | nessuna delle precedenti | **sì** (prudenza: meglio frenare) |

`SEGNI_MANUTENZIONE` parte da queste espressioni, da estendere man mano che si
vedono le pagine vere: `/manutenzione/i`, `/temporaneamente non disponibile/i`,
`/servizio non disponibile/i`, `/riprova(re)? (più )?tardi/i`,
`/errore (interno|imprevisto)/i`, `/service unavailable/i`, `/HTTP 50\d/`.
**I testi esatti delle pagine di cortesia di Allianz e Italiana non li possiamo
conoscere da qui: vedi §6.**

**Come si prova** — `scraper/verifica/diagnosi.test.mjs`: pura tabella di casi,
un `osservato` costruito a mano per riga. Le due prove che contano:
- `credenziali:'chiave-sbagliata'` → causa `credenziali-illeggibili`,
  `contaComeFallimento:false`, e il messaggio **non deve contenere** «password»
  né «codice» (una prova esplicita con `!/password|codice/i.test(messaggio)`:
  è il difetto di oggi, e va sorvegliato per nome);
- pagina con «Servizio temporaneamente non disponibile» → `portale-in-manutenzione`
  e `contaComeFallimento:false`, **anche se l'URL è quello giusto**.

---

### 2.6 `scraper/comune/riservatezza.mjs` — quello che non deve uscire

**A che serve.** Chiude i casi **14** e **15**. Le funzioni sono banali; il
valore è averle in un posto solo, con le prove accanto, così nessuno reinventa
un `slice(0,3000)` sul testo di una pagina ANIA.

**Interfaccia esatta.**

```js
export function mascheraTarga(t)     // 'FL208KP'      → 'FL***KP'   (primi 2 + ultimi 2)
export function mascheraNascita(d)   // '14/03/1978'   → '**/**/1978'
export function mascheraSegreto(s)   // qualunque cosa → '••••' (lunghezza non rivelata)
export function ripulisciControlli(ctrls)
  // toglie `text` da ogni elemento che sia un input/textarea/select e mette
  // `compilato: true|false`. Per gli altri elementi il testo resta: serve a mappare.
export function ripulisciDump(dump, opzioni = {})
  // opzioni.testo: 'no' (default) | 'si'  — 'no' rimuove del tutto `text`
  // ritorna { url, title, ctrls, testo_rimosso: true }
export function perLog(oggetto)
  // versione mascherata di un oggetto di richiesta: targa e nascita passate dalle
  // funzioni sopra, tutto il resto invariato. È quello che si passa a log().
```

Regola scritta nel modulo: **il valore di un campo non serve mai a tarare un
selettore**. Per rimappare bastano `tag/id/name/type` e la presenza del valore.
Chi un giorno vorrà il valore vero dovrà cancellare questa riga di commento, e
allora saprà che cosa sta facendo.

**Come si prova** — `scraper/verifica/riservatezza.test.mjs`:
- targhe di lunghezza diversa, targhe vuote, `null`;
- `ripulisciControlli` su un array che contiene
  `{tag:'input', type:'password', name:'Ecom_Password', text:'LaMiaPassword'}`:
  il risultato **non deve contenere** la stringa `'LaMiaPassword'` da nessuna
  parte (prova scritta come `!JSON.stringify(out).includes('LaMiaPassword')`);
- `ripulisciDump` su un dump con 3000 caratteri di testo ANIA: il risultato non
  contiene il testo, e `testo_rimosso` è `true`;
- `perLog({targa:'FL208KP', nascita:'14/03/1978', se:'20'})` →
  la data di nascita completa non compare (`!/14\/03/.test(...)`), il `se` sì.

---

### 2.7 `scraper/comune/memoria.mjs` — il freno deve sopravvivere al riavvio

**A che serve.** Chiude il caso **13**. La persistenza **non** entra in
`freno.mjs`: `scraper/verifica/scraper-freno.test.mjs:91-97` impone che il freno
abbia **zero import**, ed è una regola giusta (il freno deve restare provabile
senza niente). Quindi il freno impara solo a *dettare* e *rileggere* il proprio
stato, e chi lo scrive su disco è un altro.

**Aggiunte a `scraper/comune/freno.mjs`** (retrocompatibili, nessun import
nuovo):

```js
creaFreno({ ...opzioni, stato })  // `stato` opzionale: uno stato riletto da disco
freno.stampa()  // → { fallitiDiFila, bloccato, motivo, nonPrimaDi }  (nonPrimaDi: Infinity → null)
```

**Nuovo modulo `scraper/comune/memoria.mjs`** (zero import: il disco arriva da
fuori):

```js
export function creaMemoria({ leggi, scrivi, orologio = Date.now }) → memoria
// leggi:  () => string|null        — il chiamante fa fs.readFileSync in un try
// scrivi: (testo) => boolean       — il chiamante fa una scrittura ATOMICA (tmp + rename)

memoria.carica(predefinito)  // → { stato, origine: 'file'|'predefinito'|'illeggibile' }
memoria.salva(oggetto)       // → boolean; aggiunge `salvato_il` (ISO) e `versione`
```

**Come si prova** — `scraper/verifica/memoria.test.mjs`: `leggi`/`scrivi`
appoggiati a una variabile, niente disco.
- round-trip: salvo `{bloccato:true, fallitiDiFila:3, motivo:'x'}`, ricarico,
  ritrovo tutto;
- `leggi` che ritorna `null` → `origine:'predefinito'`, nessuna eccezione;
- `leggi` che ritorna `'{ rotto'` → `origine:'illeggibile'` e si usa il
  predefinito, **senza lanciare**;
- `scrivi` che ritorna `false` → `salva` ritorna `false` (il chiamante deve
  poterlo dire nel log);
- **prova che conta**: freno portato a `bloccato`, `stampa()`, nuovo freno creato
  con quello stato, `puoTentare(ora)` è **false** e `stato().bloccato` è **true**.
  È la prova che il riavvio non regala tre tentativi.

---

## 3. Che cosa cambia in ogni scraper

Regola comune a tutti e tre, da applicare per prima perché le altre ci poggiano
sopra:

**R1 — Il telecomando risponde con un esito, sempre.** Ogni handler ritorna un
oggetto costruito con `esito.mjs`; un unico punto in fondo serializza e imposta
`res.statusCode = statoHttp(e)`. Il fallback delle rotte sconosciute risponde
**404** con `CODICI.ROTTA_SCONOSCIUTA` e l'elenco delle rotte vere.

**R2 — Compatibilità di rilascio.** Per **un** rilascio le risposte portano sia
la forma nuova (`ok`/`dati`/`errore`) sia i campi vecchi al primo livello, perché
backend e scraper si riavviano separatamente (`deploy/autopull.sh:60` riavvia
solo gli scraper la cui cartella è cambiata). `/status` guadagna un campo
`versione` (una stringa, es. `'2026-08-02'`) così lo sfasamento **si vede** invece
di essere dedotto. Al rilascio successivo si toglie la forma vecchia.

**R3 — Il browser morto fa uscire il processo.** Subito dopo
`launchPersistentContext`:

```js
ctx.on('close', () => { log('Il browser si è chiuso: esco così systemd riavvia.'); process.exit(3); });
page.on('crash', () => { log('La pagina è crashata: esco così systemd riavvia.'); process.exit(3); });
```
più un `try/catch` attorno al lancio che logga il motivo vero e `process.exit(4)`,
e `server.on('error', e => { log('porta occupata o non apribile:', e.message); process.exit(5); })`
prima del `.listen`. È l'unico modo di sfruttare il `Restart=always` che c'è già
(casi **12** e **18**).

**R4 — Il login di avvio non parte più prima del `.listen`.** Prima si apre la
porta HTTP, poi si tenta l'accesso. Così `/status` risponde durante l'avvio
(oggi non risponde: il boot fa un login che può prendere un minuto) e il pannello
non vede un servizio «spento» che in realtà sta partendo. E il primo tentativo lo
decide il keep-alive, che il freno lo rispetta già.

---

### 3.1 Allianz — `scraper/allianz/quote-service.mjs`

1. **Rotte esatte** (`:244-299`). Passare a `creaRotte`: `/status`, `/login`,
   `/logindump`, `/otpdump`, `/lookup`, `/shot`. Chiude il caso **6**.
2. **`loggato` deve guardare la pagina, non l'URL** (`:87`, `:250`). Nuova
   `async function dentroDavvero()`: naviga se serve, poi verifica la presenza di
   **un elemento che esiste solo sulla pagina vera** — il campo targa
   dell'InquiryAnia — e non quattro parole nel testo. `/status` ritorna:
   `{ loggato, motivo_non_loggato, portale_disponibile, versione, freno }`, dove
   `portale_disponibile:false` quando `diagnosi.eManutenzione(testo)` è vera.
   Chiude il caso **4**. *(Il selettore esatto del campo targa va confermato sul
   portale vero: §6.)*
3. **`/lookup` non compila più «il primo input che trova»** (`:216-237`, `:288`,
   `:293`):
   - il `goto(INQUIRY)` **non** ha più `.catch(()=>{})`: se fallisce →
     `fallito(PORTALE_MUTO, ...)`;
   - **dopo** la navigazione si verifica di essere sulla pagina giusta
     (`isLoginUrl` o assenza del form ANIA → `fallito(PAGINA_INATTESA, ...)` e
     tentativo di login **prima**, non l'URL vecchio);
   - il campo targa si cerca per `name`/`id`; **se non c'è, è un errore**: si
     toglie `if (!el) el = ins[0]` (`:223`);
   - dopo la ricerca si **rilegge la targa mostrata a video** e la si confronta
     con quella chiesta: se non coincide → `fallito(NON_COERENTE, ...)`. È
     l'unica difesa contro il «risultato della targa precedente»;
   - `ok:true` sparisce come costante: l'esito riuscito richiede il dato ANIA.
   Chiude il caso **5**.
4. **Credenziali** (`:42-57`): sostituire `dec`/`creds` con
   `segreti.leggiCredenziali`. `autoLogin` (`:141-142`), davanti a uno stato
   diverso da `'ok'`, ritorna un **motivo strutturato**; `tentaLogin` (`:168-185`)
   passa `osservato` a `diagnosi.classificaAccesso` e, se
   `contaComeFallimento` è `false`, **non chiama `FRENO.fallito`**: logga e basta.
   Chiude i casi **8** e **21**.
5. **Freno persistente** (`:27`, `:196-197`): `creaFreno({stato})` alimentato da
   `memoria.carica()`; `FRENO.fallito`, `riuscito`, `sblocca` seguiti da
   `memoria.salva(FRENO.stampa())`. Il file va **accanto a `userdata/`**
   (`scraper/allianz/freno.stato.json`), scritto con tmp + `rename` e `mode 0o600`,
   e aggiunto al `.gitignore` locale. All'avvio, se lo stato riletto è
   `bloccato`, **non** si tenta il login. Chiude il caso **13**.
6. **`/otpdump` passa dal freno** (`:269-283`): all'inizio
   `if (!FRENO.puoTentare(Date.now())) return fallito(FRENO_TIRATO, ...)`.
   E il dump esce da `riservatezza.ripulisciControlli` +
   `ripulisciDump(dump, {testo:'no'})`. Chiude **19** e metà del **14**.
7. **Dump e log**: `richDump` (`:201-211`) non legge più `e.value`; `_dump` di
   `/lookup` (`:293`) esce ripulito; `log('Interrogazione ANIA targa:', targa)`
   (`:290`) diventa `log('Interrogazione ANIA targa:', mascheraTarga(targa))`.
   Chiude **14** e metà del **15**.
8. **Screenshot dietro interruttore** (`:257`, `:264`, `:279`, `:292`, `:297`):
   si scattano solo con `process.env.SCRAPER_SHOTS === '1'`, in una cartella con
   permessi `0700`, e `shots/lookup.png` (l'unico che contiene dati di un
   cliente) viene **cancellato a fine richiesta** salvo interruttore acceso.
   *Quanto tenerli quando l'interruttore è acceso: da chiedere a Francesco.*
9. **Serializzazione**: `CHAIN`/`locked` (`:241-242`) → `coda.esegui`, e il
   keep-alive (`:305-325`) → `coda.provaAdEseguire`, così non si accoda dietro un
   `/lookup` in corso.
10. **TOTP**: `autoLogin` (`:154`), se `c.totp` è presente, genera il codice con
    `totpCode(c.totp)` (che è già lì, `:67`) e lo usa; ricade su `c.codice` solo
    se il segreto manca o il codice generato viene rifiutato. Metà del caso **7**.

### 3.2 Italiana — `scraper/italiana/quote-service.mjs`

1. **Rotte esatte** (`:283-319`), come sopra: chiude il **6** anche qui.
2. **`/auto` guarda l'esito del login e la pagina d'arrivo** (`:221-228`):
   `if (!(await ensureLogin())) return fallito(PAGINA_INATTESA, 'Portale Italiana non accessibile: sessione caduta')`;
   e **dopo** il secondo `goto` si ricontrolla `isLoginUrl`/`hasPasswordField`
   prima di scrivere qualunque cosa. Chiude il caso **10**.
3. **Niente più «il primo input visibile»** (`:233`) e niente più «il primo
   elemento con un'icona» (`:245-249`): il campo targa e la lente si cercano per
   etichetta/`aria-label`/`name`; se non si trovano, la risposta è
   `fallito(CAMPO_ASSENTE, 'campo targa non identificabile sulla pagina', {url})`
   con il dump ripulito allegato — che è quello che serve davvero a rimappare.
   `steps` resta nel payload ma **non è più un esito**: un passo `true` significa
   «ho agito», mai «ha funzionato». Il successo richiede l'effetto verificabile
   (i dati veicolo comparsi). Chiude il residuo del caso **10**.
4. **Credenziali, freno persistente, diagnosi, coda, dump, screenshot, TOTP**:
   identici a §3.1 punti 4, 5, 7, 8, 9 — `leggiCredenziali` con l'`estrai` che
   cerca in `store.__custom` (`:48-53`), file `scraper/italiana/freno.stato.json`.
5. **Identità della fonte** (`:32`, `:51`): `/status`, `/login` e `/auto`
   accettano un parametro `?fonte=<id>` e, se non coincide con `FONTE_ID`,
   rispondono `409` con `fallito(RICHIESTA_ERRATA, 'questo servizio serve la fonte X, non Y')`.
   Il ripiego «primo record il cui nome matcha `/italiana/i`» (`:51`) resta solo
   se `FONTE_ID` non è impostato, e **logga un avviso**. Metà del caso **20**.

### 3.3 Moto — `scraper/moto/quote-service.mjs`

Questo è il file che cambia di più: è l'unico dove il silenzio arriva fino al
dato consegnato.

1. **Coda** (nuovo, non esiste nulla oggi): `coda.esegui` attorno a `/quote`,
   `/lookup`, `/map`, `/rivalsa`; `coda.provaAdEseguire` per il keep-alive
   (`:302`), che **salta il giro** se una quotazione è in corso. Chiude il **1**.
2. **Legare il risultato alla richiesta.** A fine flusso si rilegge la **targa**
   dalla pagina e la si confronta con quella chiesta: se non coincide o non c'è
   → `fallito(NON_COERENTE, ...)`. È la difesa contro il preventivo di un altro
   cliente restituito sotto la propria targa. Seconda metà del **1**.
3. **I passi del fastquote non ingoiano più gli errori** (`:44-49`):
   `waitForSelector('#FastQuotePlate')` senza `.catch`; `fill`/`click` con
   l'esito controllato; la `waitForFunction` che scade diventa
   `fallito(CAMPO_ASSENTE, 'il form fastquote non è comparso: #FastQuotePlate assente', {url})`.
   Chiude il **3**.
4. **Controllo di sanità finale** (`:245-246`): se `premio_totale` è `null`, la
   risposta **non è un preventivo**: è `fallito(RISULTATO_ASSENTE, ...)`. Mai un
   risultato senza prezzo.
5. **Rivalsa e SE si dichiarano solo se riletti** (`:61-97`, `:133-144`,
   `:236`, `:240-246`):
   - `setRivalsa` ritorna sempre `{chiesto, letto, coerente}` — rilegge già la
     `.selected-option` a `:90-94`, va solo usato;
   - `setSE` fa lo stesso: dopo «Aggiorna» rilegge il valore mostrato; il `catch`
     di `:141` non prosegue più in silenzio;
   - la risposta porta `rivalsa: {chiesto, applicato}` e `se: {chiesto, applicato}`;
   - se `applicato` diverge da `chiesto` → `fallito(NON_COERENTE, 'il portale non ha accettato l'impostazione rivalsa/SE: preventivo non attendibile')`.
     Un preventivo su una configurazione diversa da quella chiesta non è un
     preventivo con una nota: è un errore. Chiude il **2** dal lato scraper.
   - la normalizzazione del SE (`:240`, `v < 10 → 10`) resta ma diventa
     dichiarata: `se_normalizzato: true, motivo: 'valore sotto il minimo di 10'`.
6. **Garanzie**: `garanzie_incluse` continua a venire da `readResult` (`:149-155`,
   che legge quelle con «Rimuovi» accanto — è già la cosa giusta), e si aggiunge
   `garanzie_chieste_non_agganciate: [...]` per la differenza. Se manca la
   **tutela legale**, che `:232` forza sempre, l'esito è `NON_COERENTE`.
7. **`/lookup`** (`:249-262`): `ok:true` solo se ci sono i campi minimi
   (descrizione **e** almeno uno fra immatricolazione e cilindrata); altrimenti
   `fallito(RISULTATO_ASSENTE, 'la banca dati non ha restituito il veicolo per questa targa')`.
   Chiude il **23**.
8. **Log e screenshot** (`:233`, `:255`, `:257`): `perLog(...)` —
   la data di nascita **sparisce dai log** (è un dato personale che non serve a
   diagnosticare niente), la targa si maschera; screenshot dietro interruttore.
   Chiude la metà moto del **15**.
9. **R3** (`ctx.on('close')`, `page.on('crash')`, `server.on('error')`,
   `try/catch` sul lancio) e **R1/R2** come gli altri.
10. **Il keep-alive del moto passa a 3 minuti** come gli altri due? **Da chiedere
    a Francesco**: i 4 minuti di `:302` non hanno una ragione scritta, e la
    durata della sessione 24H non è documentata nel repo. Finché non si sa, si
    lascia 4 e si aggiunge il salto se occupato (punto 1), che è la correzione
    che serve davvero.

---

## 4. Che cosa cambia nel backend e nel pannello

### 4.1 `server/fonti.js`

1. **Nuovo modulo puro `server/fonti.stato.js`** (nessuna rete, provabile da
   solo), con due funzioni:

```js
export function classificaRisposta({ raggiunto, httpStatus, contentType, corpo, erroreRete })
  // → { esito: 'ok'|'errore-scraper'|'non-json'|'irraggiungibile'|'timeout', messaggio, dati }
export function statoFonte({ risposta, configurato })
  // → { stato: 'attiva'|'scaduta'|'bloccata'|'portale_non_disponibile'|'spento'|'pronta'|'non_configurata',
  //     motivo, url, diagnosi }
```

2. **I tre proxy** (`:167-169`, `:183-185`, `:197-199`) leggono `r.text()`,
   controllano `r.ok` e il content-type, e passano da `classificaRisposta`. Mai
   più `res.json({})` con 200: un guasto esce con **502** e un messaggio che dice
   se lo scraper ha risposto male, non ha risposto, o ha risposto una pagina. E
   si distingue **timeout** («la compagnia non ha risposto entro N secondi»,
   riprovabile) da **ECONNREFUSED** («servizio spento», da riavviare): oggi sono
   la stessa frase. Chiude il **17**.
3. **Il `catch` di `statoScraper` (`:47`) e `statoAllianz` (`:121`) ritorna
   `'spento'`**, come già fa `stato24h` a `:104`. `'pronta'` torna a significare
   solo «lo scraper risponde ma non è loggato e le credenziali ci sono». Nuovo
   stato `'portale_non_disponibile'` quando lo scraper dichiara
   `portale_disponibile:false`. Chiude l'**11** e la coda del **4**.
4. **`POST /:id/codice` (`:316-335`) chiama lo scraper.** Dopo il salvataggio,
   inoltra `/login` allo scraper della fonte (lo stesso di `/verifica`) e
   risponde con l'esito **vero**: `{ok, stato, url, motivo}`. È il gesto che il
   pannello annuncia; oggi non lo fa nessuno. Chiude il **9** dal lato backend.
5. **`_dump` non passa più al browser** (`:198-199`): la risposta di
   `/allianz/lookup` viene ricostruita con una **allowlist** —
   `{ok, targa, veicolo, situazione, errore}` — e il dump diagnostico resta nello
   scraper (dove esiste già `/shot` per guardare). Se serve al pannello per
   rimappare, passa **ripulito** (`ripulisciDump`), mai con il testo libero della
   pagina. Chiude il **14** dal lato backend.
6. **`load`/`save` (`:83-84`)**: `save` scrive su `STORE + '.tmp'` e poi
   `fs.renameSync`; `load` distingue «file assente» (legittimo → `{}`) da «file
   presente ma illeggibile» (→ **lancia**), e le rotte di scrittura in quel caso
   rispondono **503** senza salvare, invece di `ok:true` su un archivio inventato.
   Chiude il **16**.
7. **Le due `DELETE` (`:286`, `:311`)** controllano `save()` come le altre quattro
   rotte, e rispondono **404** se l'id non esiste invece di confermare
   un'eliminazione mai avvenuta. Chiude il **22**.
8. **`PUT /:id` (`:269`) accetta `totp_secret`** e lo cifra come fa
   `POST /:id/credenziali` a `:300`. Chiude il **7** dal lato backend.
9. **`scraperUrlFor` (`:20-24`)**: si smette di indovinare dal nome. Il record
   custom guadagna un campo esplicito `scraper` (`'italiana'` | null), scelto
   alla creazione; `scraperUrlFor` ritorna `null` se non è impostato. I record
   esistenti si migrano al primo avvio in base alla regola di oggi, **una volta**,
   scrivendo il campo. Chiude il **20**.

### 4.2 `server/moto.js`

1. **`garanzie_incluse` (`:75`)**: si smette di scrivere `'Rinuncia alla rivalsa'`
   a mano. La voce compare **solo** se `d.rivalsa.applicato === 'sì'`. Se lo
   scraper ha risposto `NON_COERENTE`, la rotta risponde **502** con il motivo,
   non un preventivo.
2. **`dettaglio` (`:78`)**: `rivalsa` e `se` prendono il valore **applicato**,
   non `d.input?.*`. Il valore chiesto si può tenere accanto
   (`chiesto`/`applicato`), mai da solo.
3. **`ok:true` con `annuale.totale === null` non esiste più** (`:80`): diventa
   502 con `RISULTATO_ASSENTE`.
4. **`/lookup` (`:109-110`)**: al ramo scraper si applica lo stesso controllo su
   `veicolo.descrizione` che il ramo Openapi ha già a `:97`.
5. **Prima di tutto questo**, va sciolto un nodo: **`POST /moto/preventivo` e
   `POST /moto/lookup` non sono chiamati da `index.html`** (il pannello usa
   `/moto/preventivo24/start`, che in `server/` non esiste; l'unico riferimento a
   `/moto/preventivo` è un commento a `index.html:12842`). O si ricabla il
   frontend su queste rotte, o si cancellano. **Da chiedere a Francesco**: nel
   frattempo le correzioni 1-4 si fanno lo stesso, perché costano poco e sono
   esattamente il difetto che tornerebbe a mordere il giorno del ricablaggio.

### 4.3 `index.html` (Pannello Fonti)

1. **Il testo dello stato «bloccata» (`:7879`)** indica il bottone giusto. Con la
   correzione 4.1.4 «Accedi col codice» sblocca davvero, quindi il testo diventa:
   «Metti un codice nuovo e premi **Accedi col codice**: il servizio riprova
   subito e ti dice se è entrato.» Se la 4.1.4 non si fa, il testo deve dire
   **Verifica accesso**. Una delle due, mai nessuna.
2. **L'alert di `accediConCodice` (`:8303`)** riporta l'esito vero restituito dal
   backend, non una frase scritta a priori. Sparisce l'attesa fissa di 7 secondi
   (`:8301`): non serve più, la risposta arriva quando arriva.
3. **`fontiBadge` (`:7782`)**: `pronta` **non è più verde** (diventa grigio, con
   etichetta «Configurata, non connessa»); nuovi `spento` → rosso «Non risponde»
   e `portale_non_disponibile` → arancione «Portale non disponibile». Il verde
   resta solo per `attiva`, coerente con `fontiDot` (`:7787`) che già fa così.
4. **`provaAuto` (`:8025`) e `provaTarga` (`:8274`)** controllano `r.ok` e
   mostrano un esito rosso/verde **sopra** la textarea, come già fa
   `analizzaApi` a `:8054-8060` — che è la prova che il pannello sa già fare la
   cosa giusta, e che qui è solo stata dimenticata.
5. **Il testo del campo TOTP (`:7833` e `:7913`)** oggi dice «Lo scraper genererà
   il codice da solo ad ogni accesso»: o diventa vero (§3.1.10 + §4.1.8) o va
   riscritto. Fino ad allora, niente «✅ salvato» per un segreto che nessuno legge.
6. **Il placeholder della textarea ANIA (`:7889`)** — «copialo e mandamelo per
   tarare l'estrazione» — invita a far uscire dati di un proprietario. Con la
   4.1.5 il contenuto è già ripulito; il testo va allineato: «qui compaiono i
   campi trovati sulla pagina, senza i dati della persona».

---

## 5. L'ordine di esecuzione

Il criterio: **nessun lotto tocca i file di un altro**, così due persone (o due
sessioni) lavorano in parallelo senza conflitti su un repo dove il deploy è un
`git pull`.

| Lotto | File toccati | Dipende da | In parallelo con |
|---|---|---|---|
| **0 · fondamenta** | `comune/coda.mjs`, `esito.mjs`, `rotte.mjs`, `segreti.mjs`, `diagnosi.mjs`, `riservatezza.mjs`, `memoria.mjs`, `freno.mjs` (aggiunte); `verifica/*.test.mjs` (7 nuovi) | — | — |
| **1 · allianz** | `scraper/allianz/quote-service.mjs`, `.gitignore` | 0 | 2, 3, 4, 5 |
| **2 · italiana** | `scraper/italiana/quote-service.mjs`, `.gitignore` | 0 | 1, 3, 4, 5 |
| **3 · moto** | `scraper/moto/quote-service.mjs`, `.gitignore` | 0 | 1, 2, 4, 5 |
| **4 · backend** | `server/fonti.js`, `server/moto.js`, `server/fonti.stato.js` (nuovo), `server/verifica/fonti-stato.test.mjs` (nuovo) | contratto §3 R1/R2 | 1, 2, 3, 5 |
| **5 · pannello** | `index.html` | contratto §4.1 | 1, 2, 3, 4 |
| **6 · sistema** | `scraper/*/deploy/*.service`, `scraper/moto/restart.sh`, `package.json` | — | tutti |

**Il lotto 0 va per primo e da solo.** Sono file nuovi: non rompe niente, non
richiede un riavvio, e finché non è finito i lotti 1-3 non hanno niente da
importare. Alla fine del lotto 0 le sette prove devono essere verdi lanciate a
mano; è il momento giusto per aggiungere a `package.json` uno script
`"verifica": "for f in scraper/verifica/*.test.mjs server/verifica/*.test.mjs; do node $f || exit 1; done"`
(nota: toccare `package.json` fa riavviare il backend all'`autopull` — innocuo,
ma va fatto sapendo).

**I lotti 1-3 sono indipendenti fra loro** anche se applicano le stesse regole:
tre file diversi, nessun import incrociato. L'ordine consigliato per gravità è
**3 (moto) → 1 (allianz) → 2 (italiana)**: il moto ha i tre casi che arrivano al
dato consegnato.

**I lotti 4 e 5 possono partire subito**, in parallelo con 1-3, perché il
contratto delle risposte è scritto qui (§3 R1/R2 e §4). È il motivo per cui
questo documento definisce la forma del JSON prima di scrivere il codice: senza,
backend e scraper vanno scritti in serie.

**Regola di rilascio.** Per la finestra di sfasamento (backend nuovo, scraper
vecchio o viceversa) vale **R2**: nessuno dei due lati può assumere che l'altro
sia già aggiornato. Il backend legge sia la forma nuova sia la vecchia; gli
scraper emettono entrambe per un rilascio. `/status` porta `versione`: la prima
cosa da guardare quando qualcosa non torna dopo un deploy.

**Ordine dentro i lotti 1-3** (conta, perché le correzioni si appoggiano):
**R1 rotte + esiti** → **R3 uscita su browser morto** → **credenziali/diagnosi**
→ **freno persistente** → **coda** → **verifiche di coerenza del dato** →
**riservatezza (dump, log, screenshot)**. Le prime due sono meccaniche e
rendono visibile tutto il resto; l'ultima è quella che si dimentica se messa per
prima.

**Prove che accompagnano i lotti 1-3**, sullo stile di
`scraper/verifica/scraper-freno.test.mjs` (che legge i sorgenti perché gli
scraper non si possono avviare qui). Da aggiungere in
`scraper/verifica/scraper-fortificato.test.mjs`:

- nessuna occorrenza di `.catch(() => {})` nelle funzioni che toccano un campo
  del portale (elenco esplicito per nome di funzione, così la prova non diventa
  un divieto generico impossibile da rispettare);
- `moto` contiene `creaCoda` e il suo `setInterval` di keep-alive passa da
  `provaAdEseguire`;
- in tutti e tre esiste `ctx.on('close'` **e** `server.on('error'`;
- in tutti e tre non esiste più `res.end(JSON.stringify({ endpoints` senza un
  `statusCode = 404` nelle righe precedenti;
- estensione della prova esistente a `scraper-freno.test.mjs:51`: oltre a contare
  `await autoLogin()`, cercare **qualunque** `fillFirst`/`submitForm` che tocchi
  la password **fuori** da `autoLogin` — è il caso **19**, che oggi il test non
  vede.

**Lotto 6** (sistema), indipendente da tutto:
- scommentare `EnvironmentFile` / `Environment=FONTI_SECRET` nei due `.service`
  di `allianz` e `italiana` — **è la causa reale del caso 8**;
- aggiungere alle tre unit `StartLimitIntervalSec=120` e `StartLimitBurst=5`, così
  un ciclo di riavvii finisce in `failed` invece di girare a vuoto, più un
  `OnFailure=` verso una notifica (**quale canale: da chiedere a Francesco** —
  `server/notify.js` oggi non conosce gli scraper);
- `scraper/moto/restart.sh:11` lancia lo scraper con `setsid nohup` fuori da
  systemd: va tolto o reso `systemctl restart`, altrimenti due istanze si
  contendono la porta 4100 (caso **18**).

---

## 6. Quello che NON si può verificare da qui

Questa parte del lavoro è stata fatta **leggendo il codice su una copia del
repository**, senza accesso alla VPS, senza i portali delle compagnie e senza i
servizi in esecuzione. Le cose qui sotto sono affermazioni **plausibili ma non
provate**: vanno verificate prima di considerare chiuso il caso corrispondente.

**A · Configurazione della macchina**

1. **`FONTI_SECRET` è davvero diversa fra backend e scraper?** Nel repo le righe
   sono commentate, ma sulla VPS qualcuno può averle aggiunte a mano.
   *Come si verifica:* `systemctl show allianz-scraper -p Environment` e
   `systemctl show withus-backend -p Environment`, oppure — prova diretta e
   definitiva — `curl 127.0.0.1:4200/status` e guardare `ha_credenziali`: se è
   `false` mentre il pannello mostra l'utente salvato, il caso **8** è in atto
   adesso. **È la prima cosa da guardare quando si arriva sulla macchina.**
2. **La retention di journald** (caso **15**): `journalctl --disk-usage` e
   `/etc/systemd/journald.conf`. Quanto indietro si può leggere una targa oggi.
3. **Se esistano davvero due istanze del moto** (caso **18**):
   `pgrep -af quote-service.mjs` e `systemctl status moto-scraper`.
4. **Se `shots/` contenga già dati di clienti**: `ls -la scraper/*/shots/` e la
   data di `lookup.png`. Se sì, vanno cancellati prima di tutto il resto.

**B · Comportamento dei portali**

5. **Il selettore stabile della pagina ANIA** (§3.1.2): serve un elemento che
   esista **solo** sulla pagina vera dell'InquiryAnia. Si ottiene con
   `/logindump` e `/lookup` — cioè **dopo** aver corretto il caso **6**, che è il
   motivo per cui quella correzione va in testa alla lista di Allianz.
6. **Il testo delle pagine di cortesia** di Allianz e Italiana (manutenzione,
   sessione scaduta servita a 200): `SEGNI_MANUTENZIONE` in `diagnosi.mjs` parte
   da espressioni generiche e va tarato sulle pagine vere. Finché non si vedono,
   il caso **4** è mitigato (si guarda l'elemento, non le parole) ma non
   riconosciuto per nome.
7. **Se la pagina del risultato ANIA mostri la targa interrogata** (§3.1.3, la
   rilettura di coerenza). Se non la mostra, serve un altro ancoraggio — per
   esempio il telaio — e va deciso guardando un risultato vero.
8. **Il percorso `/auto` di Italiana** (`italiana:223`) è indovinato: va
   confermato sul portale, altrimenti il caso **10** si corregge intorno a una
   rotta che non esiste.
9. **Gli id del fastquote 24H** (`#FastQuotePlate`, `#FastQuoteBirthDate`,
   `#cta_mp_fastquote_1`): dopo la correzione del caso **3** un id cambiato non
   sarà più silenzioso, ma sarà un errore. Vanno verificati **prima** del
   rilascio, altrimenti si passa da «vuoto silenzioso» a «rosso su tutto».
10. **La frequenza reale delle collisioni sul moto** (caso **1**): la stima 20-25 %
    viene dalla durata calcolata sul codice contro la finestra di 240 s. Si misura
    guardando i log: quante volte «[keep-alive] ok» compare fra l'inizio e la
    fine di un «Preventivo:».

**C · Raggiungibilità delle rotte**

11. **`POST /moto/preventivo` è chiamato da qualcosa in produzione?** Nel repo no
    (il pannello usa `/moto/preventivo24/start`, che in `server/` non esiste).
    Può esserci un pezzo di frontend non versionato, o una versione diversa su
    Vercel. *Come si verifica:* log di accesso di nginx / del backend su quella
    rotta. Da questo dipende se il caso **2** è **alta** (consegnato a un cliente)
    o **bassa** (codice morto).
12. **Chi chiama `GET /fonti/:id/preventivo`**, che inoltra a una rotta mai
    esistita nello scraper Italiana. Se nessuno, va cancellata.

**D · Dati ufficiali che mancano — da chiedere a Francesco**

Qui non si inventa niente: sono numeri che dipendono dai contratti con le
compagnie o da una scelta di agenzia, e sbagliarli costa più che non averli.

- **Dopo quanti accessi falliti la compagnia blocca l'utenza** (Allianz e
  Italiana, separatamente). Oggi il freno si ferma a 3 (`freno.mjs:25`): è un
  numero scelto per prudenza, non un dato. Se la compagnia ne concede 5, il
  freno può essere meno aggressivo; se ne concede 3, va abbassato a 2.
- **Quanto può durare una sessione inattiva** sui due portali. Il keep-alive è a
  3 minuti (allianz:325, italiana:341) e a 4 sul moto (`moto:302`): nessuno dei
  tre ha una ragione scritta.
- **Per quanto tempo si possono tenere gli screenshot diagnostici** che
  contengono dati di un cliente, e se si possono tenere.
- **Se il testo integrale della pagina ANIA possa essere mostrato nel pannello**
  al Super Admin (§4.3.6). È l'unico punto dove la scelta è di politica, non
  tecnica.
- **A chi devono arrivare le notifiche** quando un'unit va in `failed`
  (§5, lotto 6): `server/notify.js` non conosce gli scraper.
- **Se `POST /moto/preventivo` va ricablato o cancellato** (§4.2.5).
- **Quanto tempo massimo è accettabile per un preventivo moto** prima di
  rispondere «occupato, riprova»: serve a tarare `attesaMax` della coda (§2.1),
  che oggi è posta a 180 s per prudenza.
