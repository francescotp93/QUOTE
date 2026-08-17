# Portare i prodotti dentro IAM — quali, in che ordine, e perché

Stato al **14 agosto 2026**. Verificato sul ramo `claude/vibrant-tesla-o0glfd`
(quello da cui si aggiorna il VPS), file `index.html` di QUOTO.

Nasce da una domanda di Francesco: *«separiamo la parte veicoli e portiamo in
IAM tutto il resto?»*. L'idea è giusta. Il confine no — e la differenza cambia
quali prodotti si possono spostare.

---

## 1. Il confine vero non è «veicoli / non veicoli»

È **«ha bisogno di un portale di compagnia / non ne ha bisogno»**.

Un prodotto che quota su un portale ha dietro uno scraper: un browser vero che
gira sulla VPS, con le credenziali dell'agenzia, il secondo fattore, la sessione
da tenere viva e il freno anti-blocco. Un prodotto che quota da una tariffa
nostra non ha niente di tutto questo: calcola nel browser e scrive su Supabase.

I due gruppi non coincidono con «auto» e «non auto», e sbagliare il taglio costa
caro in due direzioni opposte:

- **Casa e Vita/TCM sembrano spostabili e non lo sono.** Passano dallo scraper
  HDI. Portarli in IAM vuol dire far parlare IAM con la VPS — cioè rimettere
  dentro esattamente l'accoppiamento che si vuole togliere.
- **Auto d'epoca sembra da lasciare e invece è libera.** È un veicolo, ma il
  premio se lo calcola da sé.

### Come l'ho verificato

Non per somiglianza di nome: ho elencato **tutte** le chiamate alla VPS presenti
in `index.html`. La costante è una sola (`PAY_API`, riga 2678) e i punti in cui
compare sono contati. Un prodotto che non appare in quell'elenco non parla con
la VPS, punto.

| a che cosa serve la VPS | quante chiamate |
|---|---|
| pannello Fonti (`/fonti/…`) — configurazione, non quotazione | 16 |
| Motor (`/moto/preventivo…`) | 4 |
| Casa HDI (`/moto/preventivoCasa/start` + `/status`) | 2 |
| Vita/TCM HDI (`/moto/premio-tcm`) | 1 |
| pagamenti (`/pay/config`) | 2 |

Tutto il resto del preventivatore non compare qui dentro.

---

## 2. La mappa, prodotto per prodotto

### Onda 1 — liberi: si spostano in IAM senza toccare la VPS

Nessuno di questi ha un portale dietro. Calcolano da tariffe nostre e salvano
nelle stesse tabelle Supabase che IAM già usa.

| prodotto | da dove viene il premio | verificato |
|---|---|---|
| **RC professionale** | `tariffe/rc_professionale.json` | `fetch('tariffe/rc_professionale.json')` |
| **RC non regolamentate** | `tariffe/rc_non_regolamentate.json` | `fetch(...)` |
| **AmTrust** (categorie professionali) | `tariffe/amtrust.json` | `fetch(...)` |
| **Rischi catastrofali** | `tariffe/catastrofali_cap.json` | `calcCatPremio()` — locale |
| **Salute / Malattia / LTC** (Aglea) | tabelle nel file | `salPremio()` — locale |
| **Tutela legale** | tabelle nel file | `tlPremio()` — locale |
| **RC rischi diversi** | tabelle nel file | `rcrdPremio()` — locale |
| **Viaggio** | tabelle nel file | `vgComboPremio()` — locale |
| **Animali domestici** (Dottorpet) | tariffa locale | non compare fra le chiamate VPS |
| **Fotovoltaico** | tariffa locale | non compare fra le chiamate VPS |
| **Infortuni** e **Infortuni famiglia** | tariffa locale | non compare fra le chiamate VPS |
| **RC vita privata** | tariffa locale | non compare fra le chiamate VPS |
| **Beni e oggetti di valore** | tariffa locale | non compare fra le chiamate VPS |
| **Multirischio impresa**, **Polizza medici** | tariffa locale | non compare fra le chiamate VPS |
| **Cauzioni** (appalti, privati, fideiussioni) | tariffa locale | non compare fra le chiamate VPS |
| **Auto d'epoca** (Sara Vintage) | wizard con tariffa locale | `openSaraVintage()` — locale |
| **CVT e ARD** | tariffa locale | non compare fra le chiamate VPS |

### Onda 2 — legati alla VPS: restano dove sono, per ora

| prodotto | portale | perché non si sposta |
|---|---|---|
| **Autovetture, autocarri, motocicli, imbarcazioni, infortuni conducente** | 24H, HDI, AXA, Allianz, Groupama, Italiana, Prima | il premio arriva da `/moto/preventivo…`, cioè dagli scraper |
| **Casa** | HDI (scraper porta 4400) | `cwCalcolaPremioCasa()` → `/moto/preventivoCasa/start` |
| **Vita e TCM** | HDI (wizard JSP) | `/moto/premio-tcm` |

---

## 3. Che cosa NON serve fare

Le tre cose che di solito rendono terribile una migrazione, qui non ci sono:

1. **Nessuna migrazione di dati.** I preventivi di QUOTO finiscono già in
   `quote_preventivi` sullo stesso progetto Supabase di IAM. Si spostano le
   schermate, non gli archivi. Uno storico che resta dov'è è uno storico che non
   si può rompere.
2. **Nessun lavoro sul ponte di sessione.** I prodotti dell'Onda 1 girerebbero
   dentro IAM, con la sessione di IAM. Il ponte serve al riquadro, e il riquadro
   resta solo per l'Onda 2.
3. **Nessun tocco agli scraper.** L'Onda 1 non li nomina nemmeno.

---

## 4. In che ordine

L'ordine non è per importanza commerciale: è **dal più isolato al più
intrecciato**. Ogni passo dev'essere pubblicabile da solo e reversibile.

**Passo 1 — un prodotto solo, come prova del percorso.** Consiglio **Tutela
legale**: tariffa piccola, una schermata, nessuna dipendenza, e se sbaglia
qualcosa non blocca nessuno. Serve a stabilire come si fa: dove vivono le
tariffe dentro IAM, come si salva il preventivo, come si prova. Fatto una volta,
gli altri sono ripetizione.

**Passo 2 — i tre che si somigliano**: RC rischi diversi, Viaggio, Rischi
catastrofali. Stessa forma del primo.

**Passo 3 — la famiglia RC professionale**: RC professionale, RC non
regolamentate, AmTrust, Polizza medici. Condividono i file di tariffa, quindi si
spostano insieme o si duplicano — e duplicare è la cosa da non fare (§5).

**Passo 4 — persona e patrimonio**: Salute/Malattia/LTC, Infortuni, Infortuni
famiglia, RC vita privata, Animali, Fotovoltaico, Beni.

**Passo 5 — impresa e cauzioni**: Multirischio impresa, Cauzioni appalti,
Cauzioni privati, Fideiussioni.

**Passo 6 — Auto d'epoca e CVT/ARD.** Ultimi non perché difficili, ma perché
stanno nel menu Motor: spostarli mentre il resto del Motor resta nel riquadro
confonde chi guarda il menu. Meglio farlo quando la separazione è già chiara.

Alla fine di questi sei passi, il riquadro serve **solo** a Motor, Casa e
Vita/TCM — cioè a ciò che ha davvero bisogno della VPS.

---

## 5. Le tre regole da non violare

**1. Ogni prodotto vive in un posto solo.** Nel momento in cui «Casa» esiste sia
in IAM sia in QUOTO, ci sono due verità sul premio, e si scopre quale sbaglia da
un cliente. Quando un prodotto si sposta, la sua schermata in QUOTO **si toglie**
e il menu punta alla nuova. Non «si nasconde»: si toglie.

**2. Le tariffe non si ricopiano a mano.** I file `tariffe/*.json` si spostano
come sono. Una cifra ribattuta a mano è una cifra che prima o poi diverge, e un
premio sbagliato non dà nessun errore: emette una polizza.

**3. Ogni passo si pubblica da solo, e si prova prima di pubblicare.** Con la
regola della casa: la prova nuova va fatta fallire sul codice di prima. Un
prodotto spostato senza una prova che confronti il premio vecchio col premio
nuovo, su almeno un caso reale, non è spostato: è riscritto e sperato.

---

## 6. Quanto costa, detto onestamente

Il lavoro grosso non è spostare le schermate: è **estrarre il calcolo** da un
file di 18.000 righe dove i prodotti condividono funzioni di servizio (anagrafica,
validazioni, salvataggio, stampa). Ogni prodotto tirato fuori porta con sé un
pezzo di quelle funzioni, e la prima volta si porta dietro anche le fondamenta —
per questo il Passo 1 costa più dei successivi messi insieme.

Non è un lavoro da una sessione. È un lavoro da fare **un prodotto alla volta,
con il sistema sempre funzionante in mezzo**.

---

## 7. Una cosa che questo documento non risolve

Spostare i prodotti rende il sistema più semplice da mantenere. **Non lo rende
più usato.** Al 14 agosto 2026 il database dice: 68 preventivi in tutto, 4
nell'ultimo mese, 5 polizze e nessuna da giugno. Il collo di bottiglia oggi è
lì, non nell'architettura.

Questa migrazione ha senso perché toglie di mezzo il riquadro per la gran parte
dei prodotti e rende tutto il resto più facile. Ma se si sceglie fra «spostare i
prodotti» e «far usare il sistema a due collaboratori per due settimane», la
seconda vale di più.
