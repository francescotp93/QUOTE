# Pacchetto fonti — come QUOTO si collega alle compagnie

Stato al 1 agosto 2026. Ramo esaminato: `claude/software-unification-guide-5lxv3p`.

---

## 0. Come e' stato scritto questo documento, e che cosa e' stato ricontrollato

Cinque letture indipendenti del codice, poi ogni affermazione impegnativa e'
passata da un secondo lettore incaricato di **smontarla**. Sette affermazioni
verificate, **sette non hanno retto** nella forma in cui erano state scritte: il
documento riporta la versione corretta, non la prima.

Tre punti li ho poi ricontrollati di persona, riga per riga, perche' riguardano
le credenziali delle compagnie e non potevano restare su fiducia:

1. **La copia nei salvataggi notturni** — confermato. `server/backup.js:71-75`
   copia `server/fonti.store.json` dentro ogni archivio, e nello stesso archivio
   finisce il dump completo delle tabelle Supabase. Se ne tengono 14
   (`server/backup.js:17-18`), sulla stessa macchina. La cartella `backups/` e'
   esclusa da git e non e' servita da nginx (che pubblica `/opt/withus-iam`,
   `deploy/nginx/iam.withusassicurazioni.it.conf:25`): non e' raggiungibile dal
   web. Il file delle credenziali resta cifrato dentro l'archivio; **i dati dei
   clienti no**, quelli sono in chiaro.

2. **La falla di `GET /fonti/:id/auto`** — confermato, ed e' peggio di come
   suonava. Il backend rimanda al browser la risposta dello scraper senza
   filtrarla (`server/fonti.js:153`). Quella risposta e'
   `{ steps, url, dump: await richDump() }` (`scraper/italiana/quote-service.mjs:246`),
   e `richDump()` legge il **valore** di ogni campo della pagina, `input`
   compresi, senza escludere quelli di tipo password
   (`scraper/italiana/quote-service.mjs:176-186`).

3. **Il ripiego della chiave di cifratura** — confermato nel codice
   (`server/fonti.js:40`). La chiave dipende da `FONTI_SECRET`; senza, si ricade
   su una stringa che sta nel sorgente. Non ho potuto verificare se sul server
   quella variabile sia impostata davvero, perche' il VPS non risponde: e' la
   prima cosa da guardare quando torna su.

---

## 1. Che cos'e' il pacchetto fonti

Una "fonte" e' una compagnia collegata a QUOTO. Collegarla vuol dire quattro cose:
le credenziali del portale (quelle dell'agenzia, con cui l'operatore entra ogni
giorno), un programma che entra al posto suo e compila il preventivo, un modo per
capire come parla il portale, e un semaforo che dice se il collegamento e' vivo.

Il pacchetto e' legittimo: sono portali di compagnie con cui Withus ha mandato, e
si automatizza un lavoro che l'operatore farebbe a mano. Restano tre punti da
tenere d'occhio, al capitolo 7. Tutto e' governato da un pannello riservato a una
sola persona (`server/fonti.js:36`), raggiungibile da Internet dietro il login IAM
(`deploy/nginx/iam.withusassicurazioni.it.conf:48`).

**Oggi non funziona nulla: il server VPS `api.withusassicurazioni.it` e' spento.**
Verificato: non risponde. Tutto quanto segue descrive codice, non un servizio attivo.

---

## 2. Che cosa c'e' oggi

| Compagnia | Come si entra | Chi fa il preventivo | Credenziali | Funziona? |
|---|---|---|---|---|
| **24H Assistance · Moto Platinum** | Sessione del browser, login fatto a mano una volta via schermo remoto (`server/fonti.js:64`) | `scraper/moto/quote-service.mjs` — **e' l'unico che estrae davvero un premio** (`:146-158`, legge Totale, garanzie, prezzi) | Nessuna nel pannello: c'e' solo la sessione salvata su disco | Scritto e completo, ma **fermo** (VPS spento) |
| **Allianz** | Utente + password + codice app Duo incollato a mano (`server/fonti.js:65`) | `scraper/allianz/quote-service.mjs` — si ferma dopo aver scritto la targa nella pagina ANIA (`:250`). **Nessun premio estratto** | Nel file cifrato del pannello | Incompleto e fermo |
| **Italiana Assicurazioni** | Portale aggiunto a runtime dal pannello, riconosciuto solo perche' il nome contiene "itali" (`server/fonti.js:19-24`) | `scraper/italiana/quote-service.mjs` — si ferma allo step 1 (`:190`). **Nessun premio** | Nel file cifrato, ramo `__custom` | Incompleto e fermo |
| **Altre compagnie create dal pannello** | Il Super Admin puo' crearne quante vuole (`server/fonti.js:233-247`) | **Nessuno.** `scraperUrlFor` restituisce null per ogni nome che non contenga "itali" | Salvate e cifrate | Si conservano credenziali che non servono a niente |

Il pannello e' piu' avanti del server. Chiama otto indirizzi che **non esistono da
nessuna parte nel repository**: `/fonti/:id/sniff`, `/sniff/:azione`, `/explore`,
`/accedi`, `/loginstate`, `/conferma-codice`, `/altro-codice`,
`/fonti/allianz/cattura` (`index.html:8038-8366`). Quei pulsanti danno errore 404.
All'opposto, `GET /fonti/:id/preventivo` esiste nel server (`server/fonti.js:158`)
ma nessuno la chiama, e lo scraper Italiana non ha quell'indirizzo: la richiesta
riceve un "va tutto bene" con dentro l'elenco degli indirizzi disponibili.

**Da verificare**: `deploy/autopull.sh:32` aggiorna il VPS da un ramo diverso
(`claude/vibrant-tesla-o0glfd`) da quello qui esaminato. Non e' dimostrabile che
il codice sul server sia questo. Prima di qualunque lavoro, stabilire qual e' la
versione buona.

---

## 3. I tre modi di collegare una compagnia

**A. Scraper dedicato** (usato per 24H, Allianz, Italiana). Un browser vero resta
acceso sul server, gia' loggato, pilotato da un "telecomando" interno (porte
4100/4200/4300, solo in locale). *Pregi*: funziona con qualunque portale, anche
senza API; regge il secondo fattore. *Difetti*: si rompe quando la compagnia cambia
pagina; oggi l'aggancio ai campi e' approssimativo — Allianz, se non trova il campo
targa, scrive nel primo che capita (`scraper/allianz/quote-service.mjs:184`).
*Quando conviene*: compagnia importante, molti preventivi, nessuna API.

**B. Cattura delle chiamate del portale.** Si registra cosa il portale chiede al
proprio server mentre l'operatore lavora, poi si rifanno quelle chiamate
direttamente. *Pregi*: molto piu' veloce e piu' stabile di un browser pilotato.
*Difetti*: richiede un lavoro iniziale di ricostruzione. *Stato reale*: **esiste
solo la meta' nel pannello** — c'e' perfino il segnalibro che registra le chiamate
di Allianz (`index.html:8172`) — ma il pezzo lato server non e' mai stato scritto.

**C. Richiesta a mano.** Nessuna automazione: l'operatore quota sul portale e
riporta il premio. *Quando conviene*: compagnie con pochi preventivi, o mentre si
costruisce A o B.

---

## 4. Dove stanno le credenziali, e quanto sono protette

Nessun valore reale e' scritto in questo documento, e nessuno e' presente nel
repository (verificato: `fonti.store.json` e' escluso da git e non esiste qui).

- **Dove**: un unico file sul server, `server/fonti.store.json` (`server/fonti.js:35`).
  Nessun database, niente su Supabase.
- **Come**: utente, password, chiave TOTP e codice 2FA sono cifrati AES-256-GCM.
  La primitiva e' scritta bene (`server/fonti.js:43-58`).
- **Chi le rilegge in chiaro**: non il pannello, ma gli scraper Allianz e Italiana,
  che aprono lo stesso file con una copia della stessa funzione
  (`scraper/allianz/quote-service.mjs:33-49`).
- **Cosa esce verso il browser**: nell'elenco fonti, solo l'utente mascherato e dei
  si/no (`server/fonti.js:197`). Ma **c'e' una falla**: `GET /fonti/:id/auto`
  rimanda al browser il risultato grezzo dello scraper Italiana senza filtrarlo
  (`server/fonti.js:140-155`), e quel risultato include il contenuto di tutti i
  campi della pagina, password compresa, se il login e' rimasto a meta'
  (`scraper/italiana/quote-service.mjs:176-186`). Da chiudere.

**Il punto piu' serio.** La chiave di cifratura viene da una variabile,
`FONTI_SECRET`. Se non e' impostata, il codice ripiega su un valore scritto nel
sorgente (`server/fonti.js:40`). E `FONTI_SECRET` **non compare in nessun file di
esempio ne' e' attiva in nessun file di avvio**: nei due scraper la riga e'
commentata (`scraper/allianz/deploy/allianz-scraper.service:13-17`). Chi installa
seguendo la documentazione non la imposta mai. Risultato: la cifratura protegge da
uno sguardo distratto, non da chi ha il codice e il file.

**Se il segreto si perde o cambia**: la decifratura fallisce in silenzio e
restituisce vuoto. Non c'e' nessuna procedura per ri-cifrare, nessun avviso. Gli
scraper almeno lo dicono nei propri registri ("credenziali assenti nel Pannello
Fonti", `scraper/allianz/quote-service.mjs:135`) e il loro `/status` espone gia'
un `ha_credenziali` che diventa falso — ma il pannello **butta via quel dato**
(`server/fonti.js:25-33, 96-106`), quindi Francesco non lo vede. Le credenziali
vanno reinserite a mano una per una.

**Le copie.** Non e' l'unico deposito: ogni notte alle 03:30 il file finisce dentro
un archivio `.tar.gz` non cifrato in `backups/`, insieme al dump completo di
Supabase, e se ne tengono 14 (`server/backup.js:72`). Archivio e chiave stanno
sulla stessa macchina.

---

## 5. Che cosa manca, in ordine di gravita'

1. **Il premio.** Allianz e Italiana non estraggono nessun importo. Il pacchetto
   esiste per sostituire l'operatore: oggi restituisce "ho compilato il campo".
2. **`FONTI_SECRET` obbligatoria.** Il server deve rifiutarsi di partire senza, e
   la variabile va nei file di esempio e nei file di avvio degli scraper.
3. **Password VNC in chiaro nel repository** (`scraper/*/deploy/*.service`, riga 12).
   Non le riporto. Aprono la sessione gia' loggata sul portale compagnia. Sono
   mitigate perche' raggiungibili solo da dentro la macchina, ma vanno spostate
   fuori dal codice e cambiate.
4. **La meta' server della cattura chiamate** e le quattro rotte del login passo
   passo. Otto pulsanti rotti nel pannello.
5. **Un allarme quando la pagina cambia.** Oggi il cambio produce un "tutto bene"
   con dati vuoti (`scraper/allianz/quote-service.mjs:185`).
6. **Il ciclo di vita del codice 2FA.** Dichiarato valido 5 minuti, ma nessuno
   controlla la scadenza al momento dell'uso e nessuno lo cancella dopo
   (`server/fonti.js:300-319`). Un codice gia' bruciato resta su disco e viene
   ritentato.
7. **Il TOTP raccolto ma inutilizzato.** La funzione che genera le sei cifre esiste
   e non e' mai chiamata (`scraper/allianz/quote-service.mjs:60`). O si completa
   l'auto-login, o e' piu' prudente non salvare quel segreto.
8. **Limite di frequenza** verso i portali: oggi non esiste.
9. **Cancellazione pericolosa**: `DELETE /fonti/:id/credenziali` non controlla
   l'id; chiamata con `__custom` azzera tutti i portali dinamici in un colpo
   (`server/fonti.js:293-297`).
10. **Registro degli accessi**: nessuna traccia di chi tocca le credenziali.
11. **Un solo amministratore**, individuato per indirizzo email, non per ruolo.
12. **Codice duplicato**: 139 righe su ~300 sono identiche fra i due scraper. Un
    bug copiato due volte c'e' gia' (`/logindump` irraggiungibile in entrambi).

---

## 6. Il contratto di una fonte

Regole verificabili. Un collegamento nuovo si accetta solo se le rispetta tutte.

**Ingresso.** Un solo insieme di campi, questi nomi, nessuna variante:
`targa`, `situazione`, `attestato`, `bersani`, `tipoGuida`, `frazionamento`,
`massimale`, `dataUltimaVoltura`, `indirizzo`. Sono gia' quelli che il server
inoltra (`server/fonti.js:158-171`). Se la fonte ne ignora qualcuno, deve dirlo
nella risposta, non tacerlo.

**Uscita in caso di successo.** Deve contenere almeno:
`esito: "ok"`, `premio_totale` (numero, non testo), `frazionamento`,
`garanzie` (elenco), `fonte`, `ottenuto_il`. Senza `premio_totale` la risposta
**non e' un successo**.

**Uscita in caso di fallimento.** `esito: "errore"`, `motivo` fra un elenco chiuso
(`non_loggato`, `serve_codice`, `pagina_cambiata`, `dati_insufficienti`,
`portale_lento`, `errore_portale`) e `dettaglio` leggibile. Codice HTTP diverso da
200. Oggi succede il contrario: Italiana risponde 200 con dentro l'elenco degli
indirizzi disponibili.

**Divieti.**
- Mai restituire un premio parziale o stimato. Se un dato manca, e' errore.
- Mai `.catch(() => {})` su una navigazione o su una lettura: ogni errore va
  registrato con l'indirizzo della pagina e l'ora.
- Mai attese a tempo fisso (`waitForTimeout`). Si attende l'elemento che deve
  comparire; se non compare entro il tempo massimo, e' `pagina_cambiata`.
- Mai ripiegare sul primo campo della pagina. Un campo si identifica con un
  selettore preciso; se non c'e', e' `pagina_cambiata`.
- Mai rimandare al pannello il contenuto grezzo della pagina senza filtrare i
  campi password.
- Mai lasciare un codice 2FA sul disco dopo averlo usato.

**Obblighi.**
- La fonte espone `/status` che dice, decifrando davvero: sono loggato si/no, ho
  credenziali si/no, ultima quotazione riuscita quando. Il pannello deve mostrare
  tutti e tre.
- La fonte esegue una **prova nota** una volta al giorno: una targa di prova con
  premio atteso entro una forbice. Se esce fuori forbice, il semaforo diventa
  rosso e parte un avviso.
- La fonte rispetta un tetto: massimo N richieste all'ora e M al giorno,
  configurabili, con coda.
- Ogni salvataggio, modifica o cancellazione di credenziali viene registrato:
  chi, quando, quale fonte, quale campo. Mai il valore.
- Il semaforo distingue quattro stati e li chiama con parole diverse:
  **attiva** (loggata, prova superata), **scaduta** (servizio su, sessione caduta),
  **spenta** (servizio non risponde), **non configurata**. Oggi "pronta" copre due
  situazioni molto diverse e inganna (`server/fonti.js:32`).

---

## 7. I rischi che vanno detti

**Frequenza.** Ogni scraper naviga da solo ogni 3 minuti per non far scadere la
sessione: circa 480 passaggi al giorno per compagnia
(`scraper/allianz/quote-service.mjs:271`). Ritmo regolare, automatico, facilmente
riconoscibile, e nessun limite sulle quotazioni. Anche con mandato e credenziali
dell'agenzia, questo e' il comportamento che i portali monitorano e che i loro
termini d'uso tipicamente disciplinano. Un intervallo variabile e piu' lungo, piu'
un tetto orario, costano poco.

**Cambio pagina.** Le compagnie rifanno il portale piu' volte l'anno. Oggi il
sistema non se ne accorge e non lo dice: risponde "tutto bene" con dati vuoti. Il
collegamento puo' restare rotto per settimane.

**Una macchina sola.** Backend, scraper, file delle credenziali, chiave che le apre
e archivi di backup stanno tutti sullo stesso VPS. Se si spegne — come adesso —
QUOTO non quota; se si perde, si perde tutto insieme. In piu' gli scraper girano
con i massimi privilegi (nessuna riga `User=` nei loro file di avvio), mentre il
backend no.

---

## 8. Da dove ripartire — i primi tre passi

1. **Stabilire qual e' il codice vero.** Riaccendere il VPS e confrontare cosa gira
   davvero con questo repository (`deploy/autopull.sh` punta a un altro ramo).
   Finche' non e' chiaro, ogni altra decisione e' a vuoto.
2. **Mettere in sicurezza il segreto.** Impostare `FONTI_SECRET` su backend e su
   entrambi gli scraper, farla diventare obbligatoria all'avvio, togliere le
   password VNC dal repository e cambiarle, cifrare l'archivio di backup e
   portarlo fuori dalla macchina.
3. **Portare una sola fonte fino al premio.** Allianz, applicando il contratto del
   capitolo 6 dalla prima riga. Una fonte che restituisce un premio vero vale piu'
   di tre fonti che restituiscono "ho compilato il campo" — e diventa il modello da
   copiare per tutte le altre.
