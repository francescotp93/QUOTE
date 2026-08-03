# Unificazione del sistema QUOTO / With Us One

Documento per Francesco. Scritto il 2 agosto 2026.
Chi lo ha scritto era in **sola lettura**: nessun file del sistema è stato
modificato, nessun ramo è stato unito, nessun comando è stato mandato alla VPS.
Ogni affermazione qui sotto ha accanto il comando che la dimostra.

---

## 0. In due righe — si può fare, a quali condizioni, e quanto dura

**Si può fare.** Il sistema non è "rotto in due": è diviso in due metà che
funzionano già insieme. Il sito che i collaboratori usano ogni giorno viene dal
ramo `main`. Il motore che calcola i preventivi viene dal ramo
`claude/vibrant-tesla-o0glfd`. Le due metà si parlano già correttamente oggi.
Unificare significa mettere le due metà nello stesso ramo, non riscriverle.

**La condizione, una sola e non negoziabile:**
> del **frontend** (la pagina che si vede) comanda `main`;
> del **backend e degli scraper** (il motore, sulla VPS) comanda `claude/vibrant-tesla-o0glfd`.

Chi inverte anche uno solo dei due lati spegne l'agenzia. Non è un modo di dire:
al punto 4 c'è la prova, riga per riga.

**Quanto dura.** Circa **4-5 ore di lavoro tecnico senza nessun impatto**
(preparazione e collaudo su un ramo nuovo che nessuno usa), poi **due finestre di
rilascio da 20-30 minuti l'una**, meglio se a distanza di un giorno. Più 48 ore
di osservazione. In totale: due mezze giornate, non una settimana.

**Il terzo ramo** (`claude/software-unification-guide-5lxv3p`, quello che si
chiama "guida all'unificazione") **non va usato come base.** Sembra il candidato
naturale ed è la trappola peggiore del lotto. Spiegato al punto 4, rischio n. 1.

---

## 1. Che cosa è successo — perché esistono due rami e che cosa c'è su ognuno

### La fotografia

I due rami si sono separati il **23 giugno 2026**. Da allora hanno lavorato
in parallelo senza mai ricongiungersi.

```
git merge-base origin/main origin/claude/vibrant-tesla-o0glfd
  -> 67a554d8115445a0245965bd896b37dc1d9a49f4   (23 giugno 2026)

git rev-list --left-right --count origin/main...origin/claude/vibrant-tesla-o0glfd
  -> 171   508
     (171 commit solo su main, 508 solo su produzione)
```

### Chi serve che cosa, oggi

| | Ramo | Dove gira | Prova |
|---|---|---|---|
| **Il sito** quoto.withusassicurazioni.it | `main` | GitHub Pages | `curl -D-` restituisce `server: GitHub.com`; il file scaricato è **identico byte per byte** a `origin/main:index.html` (stesso identificativo `51c42f1c…`) |
| **Il motore** api.withusassicurazioni.it | `claude/vibrant-tesla-o0glfd` | VPS OVH (indirizzo nei segreti, non qui) | `deploy/autopull.sh` riga 11: `BR=claude/vibrant-tesla-o0glfd` |
| **IAM** iam.withusassicurazioni.it | *altro repository* | GitHub Pages | è `francescotp93/Agente-sospesi`; il suo CNAME contiene `iam.withusassicurazioni.it`. **Fuori dal perimetro di questa unificazione.** |

Attenzione a una cosa che nel brief iniziale era scritta al contrario: **il
frontend non è su Vercel.** Vercel non serve nessuno dei due domini. Esiste un
deployment Vercel (`quote-ten-mu.vercel.app`) ma risponde `404` su ogni
percorso, e il file `vercel.json` che sta nel repository punta a
`frontend/index.html`, un file che **non esiste su nessun ramo**
(`git ls-tree -r origin/main -- frontend` → solo `index.legacy.html` e
`quoto.html`). È configurazione morta che ha ingannato chi ha scritto il brief.

### Che cosa ha ognuno dei due rami

**Solo su `main`** (le 2024 righe in più del file `index.html`, misurate con
`git diff --numstat`, che dà `44 2024`):

- pagina **Portafoglio polizze**
- pagina **Titoli e incassi**
- pagina **Scadenzario e rinnovi**
- pagina **Campagne** (email Brevo)
- documenti di pratica, sinistro strutturato, cronologia cliente
- il nuovo aspetto grafico "With Us One" (due fogli di stile:
  `withus-one-tokens.css`, `withus-one-skin.css`)

Il conteggio: `main` ha 51 pagine, produzione 47; le 4 che mancano sono
esattamente quelle sopra. E — questo è importante — **produzione non ha
nemmeno una pagina o una funzione che main non abbia**. Il confronto degli
elenchi (`comm -13`) restituisce vuoto. Il frontend di produzione è un
sottoinsieme puro: vecchio, non diverso.

**Solo su `claude/vibrant-tesla-o0glfd`** (i 508 commit):

- il motore vero di tutte le compagnie. `server/moto.js` espone **35 rotte**
  contro le **2** della versione su `main`.
- 5 moduli di server che su `main` non esistono affatto: `/crm`, `/catalogo`,
  `/preventivi`, `/fonti/vigilanza`, `/plurima-explore`
  (17 moduli montati contro 12: verificato con `grep "app.use('/"`)
- gli scraper veri: Allianz 1261 righe contro 289, Italiana 1718 contro 305,
  Moto 689 contro 304

### Il fatto centrale, da capire prima di tutto il resto

**La cartella `server/` del ramo `main` è codice morto.** Non è mai stata
installata da nessuna parte. E si dimostra così: il sito vivo (che è `main`)
chiama rotte come `/moto/premio-tcm`, `/moto/hub-auto`,
`/moto/preventivoCasa/start`, `/fonti/allianz/cattura`. Nessuna di queste
esiste nel `server/` di `main`. Esistono tutte in quello di produzione.

```
git grep -n '/premio-tcm' origin/main -- server/                       -> nessun risultato
git grep -n '/premio-tcm' origin/claude/vibrant-tesla-o0glfd -- server/ -> server/moto.js:271
```

Cioè: **se il backend di `main` girasse davvero, l'agenzia non riuscirebbe a
fare un preventivo.** Per fortuna non gira. Ma è la ragione per cui il numero
"171 commit avanti" di `main` è ingannevole: quei commit sono quasi tutti
frontend, e il suo backend è fermo a giugno.

### Il rovescio della medaglia, che è la buona notizia

Unificando, **`main` non perde niente sul backend**. Ho controllato i 7 file di
`server/` che `main` ha toccato dopo il 23 giugno: 5 sono **identici byte per
byte** su produzione (`marketing.js`, `iamLead.js`, `shop.js`, `lead.js`,
`sign.js` — stesso identificativo su entrambi i rami). Gli altri 2
(`index.js`, `fonti.js`) sono versioni **più vecchie** delle stesse funzioni.
Nessuna rotta di `main` è scomparsa su produzione: `comm -23` fra i due elenchi
di rotte restituisce vuoto.

Tradotto: produzione ha già assorbito tutto. Non c'è niente da salvare.

### E la banca dati?

Il database Supabase (progetto `ekjxrnsfqxnfxzrthdcf`) **è già l'unione dei
due rami**, ed è avanti a entrambi. Contiene sia `quote_prodotti_catalogo`
(tabella creata solo da produzione, 8 righe) sia `quote_titoli`
(creata solo da `main`, 38 righe). La tabella `quote_polizze` ha esattamente le
colonne descritte dal file di `main`, con 5 polizze dentro.

Questo è liberatorio: **il database non torna indietro con un merge.** Git può
riportare indietro un file `.sql`; non può togliere una colonna che c'è.
Da qui la regola più importante del rilascio, al punto 4:
**non si esegue nessuno script SQL. Nessuno. Per nessun motivo.**

---

## 2. Che cosa NON si sa ancora, e come si scopre

Sono cinque cose. Le prime tre vanno accertate **prima** di toccare qualcosa.
Le ultime due si possono accertare dopo.

### 2.1 — PRIMA. Sulla VPS: le porte 80 e 443 chi le tiene? (e nginx c'è?)

**Perché conta.** Il ramo `main` contiene un file,
`deploy/setup.d/10-dominio-unico.sh`, che il ramo produzione **non ha**
(`git ls-tree -r --name-only origin/claude/vibrant-tesla-o0glfd -- deploy/setup.d`
elenca solo `00-chiave-claude.sh`). Quel file installa nginx e certbot,
riconfigura i siti della macchina e chiede un certificato. E `autopull.sh`
**esegue automaticamente come amministratore qualunque file `.sh` nuovo trovi
in quella cartella**, entro un minuto dal rilascio.

Ha una protezione: se le porte 80/443 sono tenute da un programma diverso da
nginx, esce e non fa niente. **Ma se su quella macchina nginx c'è già, la
protezione non scatta e lo script parte.** Riconfigurare nginx sulla macchina
che serve l'API è il modo più diretto per spegnere il motore dei preventivi.

**Come si scopre.** Collegandosi alla VPS e lanciando:
```
ss -tlnp 'sport = :80'
ss -tlnp 'sport = :443'
command -v nginx
ls /var/lib/withus-autopull/
```

**Nota.** Il piano al punto 3 rimuove comunque quel file dal ramo unificato,
quindi il pericolo è neutralizzato a monte. Ma la risposta serve lo stesso,
perché dice se qualcuno lo ha già eseguito in passato (l'ultimo comando elenca
gli impianti già segnati come "fatto").

### 2.2 — PRIMA. Sulla VPS: esistono `/opt/withus-quoto` e `/opt/withus-iam`?

**Perché conta.** L'`autopull.sh` di `main` contiene un blocco chiamato
"Facciate del dominio unico" che ogni minuto fa un `git reset --hard` su
quelle due cartelle, forzandole su `main`. Il `reset --hard` **cancella senza
chiedere** qualunque cosa ci sia dentro. Ha la protezione
`[ -d "$fe/.git" ] || continue`: se le cartelle non esistono, è innocuo.

**Come si scopre.**
```
ls -d /opt/withus-quoto/.git /opt/withus-iam/.git
```

### 2.3 — PRIMA. Sulla VPS: quali scraper sono davvero accesi?

**Perché conta.** Serve per sapere quanti servizi si riavviano al primo
aggiornamento dopo l'unificazione, cioè quanto è largo il danno se qualcosa va
storto. Il repository dice quali *potrebbero* essere installati (allianz,
assieasy, axa, groupama, hdi, italiana, kube, leoaccess, moto, prima,
quotiamo), non quali lo *sono*.

**Come si scopre.**
```
systemctl list-units '*scraper*' --all
journalctl -u withus-autopull --since '-2h'
```

### 2.4 — Da confermare, ma non blocca: la sorgente di GitHub Pages

Che il sito serva `main` è **provato tre volte in modo indipendente**: gli
header dicono GitHub, il contenuto è identico byte per byte a `origin/main`, e
il registro delle build di GitHub mostra le ultime 30 pubblicazioni tutte con
`head_branch: main`, con l'ultima (`b1adabe`, 30 luglio 13:59:22) che
corrisponde esattamente alla punta di `main` e all'orario del file servito.

Quello che non ho potuto leggere è l'**impostazione** (il proxy blocca quella
chiamata all'API di GitHub). Non cambia niente al piano — anzi, siccome il
piano tiene `main` come ramo unico, l'impostazione **non va toccata affatto**.

**Come si conferma comunque, in 10 secondi:** GitHub → repository QUOTE →
Settings → Pages → "Build and deployment". Deve dire: Deploy from a branch,
`main`, `/ (root)`. **Fotografare quella schermata prima di iniziare.**

### 2.5 — Da confermare dopo: due dettagli minori

- **Le colonne `lead` e `lead_origine`** non esistono nel database
  (`select count(*) ... where column_name in ('lead','lead_origine')` → **0**),
  ma il modulo `server/crm.js` di produzione le usa in un filtro. Oggi non fa
  danno perché nessuna pagina chiama quella rotta (`grep "crm/anagrafiche"` su
  entrambe le versioni di `index.html` → 0 occorrenze). Va deciso dopo
  l'unificazione: o si aggiungono le due colonne, o si toglie il filtro.
- **La funzione `posta`** gira su Supabase (versione 12, attiva) ma il suo
  codice sorgente **non esiste in nessuno dei tre rami**. L'unificazione non la
  può rompere, ma nessuno la può nemmeno ricostruire. Da ritrovare, con calma,
  in un lavoro separato.

---

## 3. Il piano, passo per passo

Regola generale: **si costruisce tutto su un ramo nuovo che nessuno usa, si
verifica lì, e solo alla fine si sposta il mondo vero.** Fino alla Fase 3 il
sistema vivo non si accorge di niente.

Nome del ramo nuovo: `unificazione`.

---

### Fase 0 — Le reti di sicurezza (10 minuti, nessun impatto)

**Che cosa si fa.** Si piantano due segnalibri permanenti sullo stato di oggi:

```
git tag backup/main-pre-unificazione        origin/main
git tag backup/prod-pre-unificazione        origin/claude/vibrant-tesla-o0glfd
git push origin backup/main-pre-unificazione backup/prod-pre-unificazione
```

Poi si fotografa la schermata GitHub → Settings → Pages (punto 2.4) e si
raccolgono le risposte ai punti 2.1, 2.2, 2.3 dalla VPS.

**Come si verifica.** `git ls-remote --tags origin | grep pre-unificazione`
deve mostrare due righe.

**Come si torna indietro.** Non serve: un segnalibro non cambia niente.
I segnalibri **non si spostano mai più**. Sono l'unica cosa che rende
reversibile tutto il resto di questo documento. Non vanno cancellati nemmeno
a lavoro finito.

---

### Fase 1 — Costruire il ramo unificato (3-4 ore, nessun impatto)

**Che cosa si fa.** Si crea `unificazione` partendo da **produzione** e ci si
porta dentro `main`:

```
git checkout -b unificazione origin/claude/vibrant-tesla-o0glfd
git merge origin/main
```

Git segnala **8 file in conflitto** (verificato con `git merge-tree`, che non
scrive niente):

| File | Chi vince | Perché |
|---|---|---|
| `index.html` | **main**, tranne 3 punti | vedi sotto |
| `server/index.js` | **produzione** | il lato `main` del conflitto è letteralmente vuoto; produzione aggiunge 5 moduli |
| `server/fonti.js` | **produzione** | produzione ha 25 rotte, `main` 11, e le 11 sono tutte dentro le 25 |
| `scraper/italiana/quote-service.mjs` | **produzione** | 1718 righe contro 305 |
| `scraper/italiana/start-service.sh` | **produzione** | contiene il blocco che impedisce due browser sullo stesso profilo |
| `scraper/italiana/deploy/italiana-scraper.service` | **produzione** | il lato `main` è vuoto |
| `deploy/autopull.sh` | **produzione**, poi due ritocchi a mano | vedi sotto |
| `supabase/quote_polizze.sql` | **main** | vedi sotto |

**I 3 punti di `index.html` dove vince produzione.** Sono nella zona del login
guidato al Pannello Fonti, e sono correzioni vere fatte guardando i portali
delle compagnie:

1. `if(step==='attesa_otp')` diventa `if(step==='attesa_otp'||step==='attesa_codice')`
2. la lista degli errori diventa
   `['error','errore','non_loggato','senza_credenziali','timeout_otp','totp_rifiutato']`
3. il messaggio all'operatore diventa "codice di verifica (email o app di
   autenticazione, secondo la compagnia)" invece di "codice OTP via email"

Se si prende `main` anche qui, succede questo: quando HDI va in errore, o
quando in Pannello Fonti mancano utente e password, **l'operatore vede
"Accesso in corso…" per tre minuti** (60 tentativi da 3 secondi) e poi un
messaggio sbagliato. Gli altri 4 conflitti su `index.html` sono solo il nome
QUOTO da sostituire con WITH US ONE: vince `main`.

**`supabase/quote_polizze.sql`.** Qui i due rami hanno creato **due tabelle
diverse con lo stesso nome**. Vince `main` senza discussione, perché la tabella
che c'è davvero nel database ha le colonne di `main`
(`cliente_id`, `data_effetto`, `data_scadenza`…) e non quelle di produzione
(`anagrafica_id`, `decorrenza`, `scadenza`…). Il commit di produzione lo
ammette da solo nel titolo: *"DA REVIEW, non applicata"*.
**La versione di produzione va cancellata, non conservata accanto.** Il perché
è al punto 4, rischio n. 3.

**`deploy/autopull.sh` — attenzione, qui git sbaglia.** Prendere la versione di
produzione e poi controllare a mano due cose:

```
grep -c 'for s in deploy/setup.d' deploy/autopull.sh    -> deve dare 1
grep -n '^BR=' deploy/autopull.sh                        -> deve dire BR=main
```

Il primo controllo esiste perché la fusione automatica **duplica un blocco
senza segnalare niente**: nel risultato calcolato da git il ciclo compare due
volte (righe 108 e 151, identiche). Nessun marcatore di conflitto, nessun
avviso. Il file gira ogni minuto sulla VPS.

**Poi, sempre in Fase 1, tre pulizie obbligatorie:**

```
git rm deploy/setup.d/10-dominio-unico.sh
git rm -r deploy/nginx/
git rm vercel.json
```

Le prime due tolgono lo script che si installa da solo (punto 2.1). La terza
toglie il file morto che ha fatto credere a tutti che il sito fosse su Vercel.

**Come si verifica che la Fase 1 sia andata bene.** Nove controlli, tutti sul
ramo `unificazione`, tutti da far tornare **prima** di andare avanti:

```
1)  git show unificazione:index.html | wc -l                      >= 17082
2)  grep -c 'id="page-' index.html                                = 51 pagine distinte
3)  grep -c "loadPortafoglio\|loadTitoli\|loadScadenzario\|loadCampagne"  > 0 per tutte e quattro
4)  grep -c "db.from('quote_ticket')" index.html                  = 0
    grep -c "db.from('iam_ticket')"   index.html                  = 5
5)  git ls-tree --name-only unificazione | grep withus-one        = due file (tokens + skin)
6)  grep -cE "app.use\('/(crm|catalogo|preventivi|plurima-explore)'" server/index.js  = 4
7)  wc -l scraper/allianz/quote-service.mjs                       >= 1261
    wc -l scraper/italiana/quote-service.mjs                      >= 1718
    wc -l scraper/moto/quote-service.mjs                          >= 689
8)  ls deploy/setup.d/                                            solo 00-chiave-claude.sh
9)  grep -c 'for s in deploy/setup.d' deploy/autopull.sh          = 1
```

Il controllo n. 4 merita una parola: sono le cinque righe che dicono in quale
tabella finiscono i ticket. Su `main` è `iam_ticket`, su produzione
`quote_ticket`. Nel database `iam_ticket` ha 38 righe (33 sue più le 5
travasate) e `quote_ticket` è ferma a 5: **la migrazione è già stata fatta.**
Se una di quelle cinque righe finisse sul ramo unificato nella versione di
produzione, gli operatori aprirebbero segnalazioni in una tabella che nessuno
guarda. Senza nessun errore visibile.

Infine, l'unico controllo davvero probante sulle rotte:

```
per ogni percorso trovato in index.html con
  grep -oE "PAY_API[[:space:]]*\+[[:space:]]*'[^']*'"
verificare con git grep che esista una definizione .get/.post/.put/.delete
nella cartella server/ del ramo unificato.
```

Devono risultare **31 percorsi, tutti trovati**. Sentinelle minime:
`/moto/premio-tcm`, `/moto/preventivoCasa/start`, `/moto/preventivoCasa/status/`,
`/fonti/allianz/cattura`, `/fonti/allianz/cattura-pub`, `/marketing`.

**Come si torna indietro.** `git branch -D unificazione`. Il ramo non è mai
stato pubblicato, non lo ha visto nessuno, non è collegato a niente.
**Questa fase è reversibile al 100%.**

---

### Fase 2 — Accendere il frontend unificato (20 minuti, impatto: il sito)

**Che cosa si fa.** Si porta il contenuto di `unificazione` su `main`.
GitHub Pages ricostruisce il sito da solo, in circa 40 secondi (misurato: la
build delle 13:59:22 ha prodotto un file datato 13:59:58).

```
git push origin unificazione:main
```

**La VPS non si accorge di niente**, perché continua a seguire
`claude/vibrant-tesla-o0glfd`, che in questa fase non viene toccato.

**Che cosa cambia davvero per chi usa il sito.** Pochissimo, ed è il punto:
il nuovo `index.html` è quello di oggi **più** le tre correzioni del login
guidato. Nessuna pagina sparisce, nessuna funzione cambia, l'aspetto è identico.

**Come si verifica.** Dopo un paio di minuti:

```
curl -sS -o vivo.html https://quoto.withusassicurazioni.it/
wc -l vivo.html                                          >= 17082
grep -c "attesa_otp'||step==='attesa_codice'" vivo.html   = 1
grep -c "senza_credenziali" vivo.html                     = 1
grep -c "cmpCreaBozza\|agganciaPolizze\|SIN_PT_STATI\|TIT_RATE_ANNO" vivo.html   tutte presenti
curl -o /dev/null -w '%{http_code}' https://quoto.withusassicurazioni.it/withus-one-skin.css    = 200
curl -o /dev/null -w '%{http_code}' https://quoto.withusassicurazioni.it/withus-one-tokens.css  = 200
```

Poi, con le mani: aprire il sito, entrare, aprire **Portafoglio**,
**Scadenzario**, **Titoli**, **Campagne**, e fare **un preventivo auto vero**
fino al confronto compagnie.

**Come si torna indietro** (2 minuti, il sito torna com'era):

```
git push --force-with-lease origin backup/main-pre-unificazione:main
```

E si aspettano 60 secondi che GitHub ricostruisca. Funziona **solo perché il
segnalibro della Fase 0 esiste.** Senza quello, non si torna indietro.

---

### Fase 3 — Spostare la VPS su `main` (30 minuti, impatto: il motore)

Da fare **il giorno dopo la Fase 2**, non lo stesso giorno, e **non di lunedì
mattina**. Meglio: martedì o mercoledì, tardo pomeriggio.

**Che cosa si fa.** Un commit di **una riga sola** sul ramo di produzione, che
cambia `BR=claude/vibrant-tesla-o0glfd` in `BR=main` dentro `deploy/autopull.sh`.

Entro un minuto la VPS legge la riga nuova e, dal giro successivo, comincia a
seguire `main`.

**Perché non è pericoloso quanto sembra.** Il contenuto di `server/` e
`scraper/` su `main` in questo momento è **lo stesso** che la VPS sta già
eseguendo: viene da produzione, per costruzione (Fase 1). Cambia il nome del
ramo, non il codice. Le uniche differenze reali sono `deploy/autopull.sh`
(ripulito) e l'arrivo di file di frontend che sulla VPS non fanno niente.

**L'ordine è obbligatorio e non si può invertire.** Prima il contenuto
unificato deve stare su `main` (Fase 2), poi si sposta la VPS. Chi inverte i
due passi manda la VPS su un `main` che ha ancora il backend di giugno: due
rotte invece di trentacinque, e l'agenzia non fa più preventivi.

**Come si verifica.** Sulla VPS:

```
journalctl -u withus-autopull --since '-10m'      deve mostrare "aggiorno <sha> -> <sha>"
git -C /opt/withus-backend rev-parse --abbrev-ref HEAD    = main
systemctl list-units '*scraper*' --all             tutti i servizi attivi, nessuno in restart continuo
```

Dall'esterno, le sei sonde che discriminano un backend vero da uno vecchio.
Devono rispondere **401 o 403, mai 404**:

```
curl -o /dev/null -w '%{http_code}\n' https://api.withusassicurazioni.it/catalogo
                                       .../preventivi   .../crm
                                       .../fonti/vigilanza
                                       .../moto/ania    .../plurima-explore
```

Il controllo di controllo, che rende la sonda onesta:
`.../rotta-che-non-esiste-xyz` deve dare **404**. Se desse 401 anche quello, la
sonda non sta misurando niente.

Poi, con le mani: **un preventivo auto vero, dall'inizio alla fine**, e un
**login guidato** su una compagnia dal Pannello Fonti.

**Come si torna indietro** (2-3 minuti):

```
sul ramo main, rimettere BR=claude/vibrant-tesla-o0glfd in deploy/autopull.sh e pubblicare
```

Entro un minuto la VPS torna sul ramo vecchio da sola. Se non bastasse, si fa
a mano in SSH: `git -C /opt/withus-backend checkout claude/vibrant-tesla-o0glfd`
e si riavviano i servizi.

**Chi guarda dev'essere fisicamente presente per i 15 minuti successivi**, con
un preventivo aperto. Il guasto tipico di questa fase non fa rumore: gli
scraper vanno in errore all'avvio e il sito continua a girare la rotella.

---

### Fase 4 — Chiudere (30 minuti, nessun impatto)

Dopo 48 ore senza problemi:

1. Congelare il ramo vecchio invece di cancellarlo:
   `git tag archivio/produzione-fino-al-2026-08-XX origin/claude/vibrant-tesla-o0glfd`
   e poi cancellare il ramo. Il segnalibro resta per sempre.
2. Scrivere in cima al `README` tre righe: *il frontend sta su GitHub Pages dal
   ramo `main`; il backend e gli scraper stanno sulla VPS e seguono `main` via
   `deploy/autopull.sh`; ramo unico = `main`.*
3. Mettere un ordine di esecuzione scritto nella cartella `supabase/`:
   `quote_schema.sql` → `quote_prodotti_catalogo.sql` →
   `quote_preventivi_numerazione.sql` → `quote_preventivi_m1.sql` →
   `quote_polizze.sql` → `sinistro_strutturato.sql` → `ticket_coda_unica.sql`.
   Oggi quell'ordine non è scritto da nessuna parte e va indovinato leggendo i
   collegamenti fra tabelle.

---

### Fase 5 — Il terzo ramo, dopo e con le pinze (mezza giornata, separata)

Il ramo `claude/software-unification-guide-5lxv3p` è `main` più 15 commit
(`git rev-list --left-right --count` → `0 15`). Contiene lavoro utile
(riservatezza nei log, moduli comuni, documenti) **scritto però sopra copie
degli scraper vecchie di 42 commit**.

Non si unisce: si prendono i suoi commit **uno per uno**, e mai quelli che
riscrivono `scraper/allianz|italiana|moto/quote-service.mjs`.

**E prima di toccarlo, una riparazione obbligatoria.** Quel ramo ha tolto una
funzione, `ripulisciQualsiasi`, che quattro scraper vivi importano per nome
(`allianz`, `hdi`, `italiana`, `moto`). Provato davvero, eseguendo l'import in
una cartella temporanea:

```
SyntaxError: The requested module '../comune/riservatezza.mjs'
does not provide an export named 'ripulisciQualsiasi'      EXIT=1
```

Non è un errore che compare "quando si usa quella funzione": **il programma non
parte proprio.** Con l'aggiornamento automatico attivo, i quattro scraper
entrerebbero in riavvio continuo, e sono quelli del recupero veicolo e del
calcolo premio. La riparazione è una riga:
`export const ripulisciQualsiasi = perLog;`

**Prova d'uscita prima di qualunque pubblicazione:** l'import secco dei quattro
scraper deve uscire con codice 0.

---

## 4. I punti dove ci si può rompere, dal peggiore al meno grave

### 1. Usare il ramo "guida all'unificazione" come base — **spegne i preventivi**

Sembra il candidato ovvio: è il più recente, si chiama così, contiene lavoro
buono. È la trappola peggiore.

**Prova.** `git merge-tree` fra quel ramo e produzione dà **10 file in
conflitto, due in più** del merge normale, e sono i due che fanno male:
`scraper/allianz/quote-service.mjs` e `scraper/moto/quote-service.mjs`.
Il motivo: `main` non ha **mai** toccato quei due file dal 23 giugno
(l'identificativo del file su `main` è identico a quello dell'antenato comune).
Sono fermi a 289 e 304 righe. Il ramo "guida" li ha portati a 342 e 321
partendo da lì. Produzione intanto è a **1261 e 689** righe, dopo 42 e 38
commit.

Risultato: git presenta due conflitti in cui il lato che *sembra* più nuovo è
in realtà il più arretrato di sei settimane.

**Difesa.** Base = produzione. Sempre. E il controllo di uscita è numerico:
`wc -l` su quei tre file deve dare **1261 / 1718 / 689 o più**, mai i numeri
della linea `main`.

### 2. Uno script che si installa da solo sulla VPS — **può spegnere l'API**

**Prova.** `deploy/setup.d/10-dominio-unico.sh` esiste solo su `main`.
L'`autopull.sh` di produzione contiene:
`for s in deploy/setup.d/*.sh; do ... "$REPO/$s" ...` — cioè esegue come
amministratore ogni file nuovo che trova lì dentro, una volta sola, entro un
minuto. Quello script fa: `apt-get install nginx certbot`, clona due cartelle
in `/opt/`, copia file di configurazione in `/etc/nginx/sites-available`,
ricarica nginx, e chiede un certificato con `certbot --nginx`.

Peggiora: la fusione automatica di `autopull.sh` **duplica il ciclo** (2
occorrenze invece di 1, verificato) senza segnalare nulla, e porta dentro anche
un blocco che ogni minuto fa `git reset --hard` su `/opt/withus-quoto` e
`/opt/withus-iam`.

**Difesa.** Le tre righe `git rm` della Fase 1, più i controlli 8 e 9.
E le risposte ai punti 2.1 e 2.2 prima di iniziare.

### 3. Eseguire "per sicurezza" il file SQL sbagliato — **apre il portafoglio a tutti**

Questo è il caso che non fa rumore ed è il più insidioso di tutto il documento.

**Prova.** Le regole di riservatezza vive sulla tabella `quote_polizze` si
chiamano `pol_select`, `pol_insert`, `pol_update`, `pol_delete`, e la prima
dice `quote_vede(creato_da)`: ognuno vede il suo. Il file `quote_polizze.sql`
del ramo produzione crea regole con nomi **diversi** (`quote_pol_select` ecc.)
e condizione `using (true)`: tutti vedono tutto. I suoi comandi di rimozione
puntano ai nomi nuovi, quindi **non sostituiscono le regole esistenti: ci si
aggiungono.**

In PostgreSQL due regole permissive sulla stessa operazione si sommano. Non
restringono: aprono. Risultato: ogni collaboratore autenticato vedrebbe
l'intero portafoglio polizze dell'agenzia, e con `quote_pol_delete` potrebbe
cancellarlo — mentre oggi serve essere amministratori.

E il file si presenta innocuo: `create table if not exists` non fa niente
perché la tabella c'è già, quindi chi lo lancia vede solo messaggi tranquilli.

**Difesa.** Il file di produzione va **cancellato** dal ramo unificato, non
archiviato accanto con un altro nome. E soprattutto, la regola generale:
**durante e dopo l'unificazione non si esegue nessuno script SQL.** Il database
è già a posto (punto 1).
> ⚠️ **Un'apertura dei permessi non si annulla premendo "indietro" su git.**
> È l'unica parte di questo lavoro che git non può riportare indietro.
> Se succede, va riparata a mano con quattro comandi `drop policy`.

**Controllo di uscita:** rileggere le regole di `quote_polizze`; devono
comparire solo nomi che iniziano per `pol_`. Se compare un `quote_pol_`,
qualcuno lo ha eseguito.

### 4. Risolvere `server/index.js` "tenendo main perché è più recente" — **spegne il preventivatore**

**Prova.** Produzione monta **17** moduli, `main` ne monta **12**. Mancano
`/crm`, `/catalogo`, `/preventivi`, `/plurima-explore`, `/fonti/vigilanza`.
Il file `preventivatore.html` esiste solo su produzione e chiama
`/catalogo/prodotti`, `/crm/anagrafiche`, `/preventivi/quota`.
Il conflitto è banale — **il lato `main` è letteralmente vuoto** — ma è
esattamente il tipo di conflitto che si risolve d'istinto.

**Difesa.** Il controllo 6 della Fase 1: deve dare 4.

### 5. Il frontend che torna indietro — **perde un mese di lavoro**

**Prova.** Se si dichiarasse "produzione è la verità" e si puntasse la
pubblicazione sul ramo produzione, `index.html` passerebbe da 17082 a 15102
righe. Sparirebbero 4 pagine (Portafoglio, Titoli, Scadenzario, Campagne) e 88
funzioni. E i due fogli di stile `withus-one-tokens.css` e
`withus-one-skin.css` **non esistono sul ramo produzione**
(`git cat-file -e` → "path does not exist"), mentre il sito vivo li carica e li
serve (200, 3557 e 11081 byte): il sito si aprirebbe **senza aspetto grafico**,
colori e spaziature sbagliate ovunque, senza nessun errore visibile.

**Difesa.** I controlli 1, 2, 3, 5 della Fase 1.

### 6. Prendere `main` sui tre punti del login — **tre minuti di rotella**

Già spiegato in Fase 1. Rischio contenuto ma quotidiano: capita ogni volta che
una fonte scade e qualcuno prova a riagganciarla.

### 7. Cambiare il nome del ramo senza spostare la VPS — **i deploy si fermano in silenzio**

**Prova.** Tutti e tre i rami hanno `BR=claude/vibrant-tesla-o0glfd`
(verificato riga per riga). Se si unifica su `main` e si abbandona il ramo
vecchio senza cambiare quella riga, la VPS continua a seguire un ramo che non
riceve più commit. Non si rompe niente subito — ed è il problema: ci si accorge
del blocco settimane dopo, quando una correzione attesa non arriva mai.

**Difesa.** La Fase 3, che è precisamente questo passo, con il suo ordine
obbligatorio.

### 8. Cose già rotte oggi, che l'unificazione non peggiora

Vanno dette perché non vengano scambiate per danni dell'unificazione:

- **Quattro funzioni del pannello amministratore non funzionano** (statistiche,
  utenti, elenco compagnie). Puntano a `quote-ten-mu.vercel.app`, che risponde
  `404` su tutto. È così da prima, e nessuno se n'era accorto.
- **Una rotta senza autenticazione** con la chiave scritta nel codice:
  `/plurima-explore`, chiave di ripiego `leo-explore-Px7wQ2`, montata senza
  controllo di accesso, con il commento *"RIMUOVERE dopo l'uso"*. Fa da ponte
  verso sessioni di portale già collegate con le credenziali delle compagnie.
  Unificare non la peggiora — ma la promuove a "codice ufficiale", e da quel
  momento smette di sembrare temporanea. **Da togliere, in un lavoro a parte.**

### 9. Il ponte verso IAM

`iam.withusassicurazioni.it` è un **altro repository** (`Agente-sospesi`) e non
va cercato qui. Però **usa lo stesso motore**: chiama
`api.withusassicurazioni.it/firma-collab/doc`. Quindi qualunque modifica al
backend decisa qui ricade anche su IAM, che nessuno ricollauderà.

**Difesa.** Aggiungere al collaudo della Fase 3 una prova della firma
collaboratori: aprire IAM e verificare che il documento da firmare si carichi.

---

## 5. Che cosa serve da Francesco

### Tre decisioni

**Decisione 1 — Il nome del ramo unico.**
Consiglio: **`main`**. Ragione pratica: il sito già pubblica da lì, quindi
l'impostazione di GitHub Pages **non va toccata** e resta un pericolo in meno.
L'alternativa (tenere `claude/vibrant-tesla-o0glfd`) obbligherebbe a cambiare
la pubblicazione del sito nello stesso momento in cui si sposta la VPS: due
interruttori insieme, mai una buona idea.

**Decisione 2 — Il "dominio unico": si fa o si lascia?**
Su `main` c'è un piano già scritto ma mai acceso: servire il sito dalla VPS con
nginx invece che da GitHub. Oggi il sito sta su GitHub e funziona.
Consiglio: **si lascia com'è.** Quel piano si fa un altro giorno, a mano, in
collegamento con la macchina, con te davanti — non da un programma automatico
che parte un minuto dopo un rilascio. Se invece lo vuoi davvero, dimmelo:
cambia la Fase 1, non il resto.

**Decisione 3 — Quando.**
Fase 2 (il sito) e Fase 3 (il motore) in **due giorni diversi**, non nello
stesso pomeriggio. Non di lunedì, non di venerdì sera. Serve qualcuno davanti
al computer per i 15 minuti dopo la Fase 3, con un preventivo aperto.

### Tre accessi

1. **Un collegamento alla VPS** (l'indirizzo sta nei segreti, non in questo
   documento: il repository e' pubblico), per le tre domande del
   punto 2 e per i controlli della Fase 3. Bastano comandi di sola lettura per
   le domande; il collegamento serve comunque, come via di fuga, durante la
   Fase 3.
2. **La schermata GitHub → QUOTE → Settings → Pages.** Una fotografia, prima di
   iniziare. Serve solo a poter tornare indietro sapendo com'era.
3. **Conferma esplicita, scritta, che nessuno eseguirà script SQL** durante
   l'unificazione. È l'unico punto irreversibile del lavoro.

### Una cosa da sapere sui tempi

Il ramo di produzione **continua a ricevere commit mentre leggi questo**: la
sua punta oggi è `366eabc` del 2 agosto ore 12:50, più recente dell'analisi che
ha prodotto questo documento. Non è un problema — ma significa che la Fase 1 va
rifatta con i rami aggiornati al momento del rilascio, non con quelli di oggi,
e i nove controlli vanno ripetuti allora. Un piano di unificazione ha una data
di scadenza: **questo vale finché il ramo di produzione non prende altre due o
tre settimane di vita propria.** Più si aspetta, più si allarga la distanza.
