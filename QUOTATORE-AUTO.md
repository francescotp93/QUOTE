# Il quotatore auto — come funziona

Documento tecnico su **una sola parte** di QUOTO: il preventivatore RC Auto e
veicoli. Scritto il **4 agosto 2026** misurando il codice.

Serve a chi deve capirlo o proporre miglioramenti senza averlo mai visto.

> **Il repository è pubblico** e questo documento è destinato a un servizio
> esterno: non contiene credenziali, indirizzi di macchine né dati di clienti.

---

## 1. Che cosa fa

Da una **targa** e una **data di nascita** arriva a un **premio** — chiedendolo
a più compagnie e mettendole a confronto.

```
targa + nascita
      │
      ├─► recupero automatico del veicolo e del proprietario
      │
      ▼
 sette passi guidati
      │
      ▼
 premi da cinque compagnie, uno accanto all'altro
```

Le compagnie che quotano auto oggi: **Allianz, AXA, Groupama, HDI, Prima**.
Più **24H Moto Platinum** per moto e ciclomotori, che ha un percorso suo.

Vive dentro `index.html` (~1300 righe fra `AUTO_STEPS` e le garanzie, più le
funzioni di premio). Tutte le funzioni cominciano per `aw` — *auto wizard*.

---

## 2. I sette passi

```js
const AUTO_STEPS = ['Targa','Anagrafiche','Veicolo','Situazione',
                    'ARD/CVT','Preventivo','Modifica/Conferma'];
```

| passo | cosa si fa |
|---|---|
| **1. Targa** | targa, data di nascita, tipo di veicolo, tipo di preventivo |
| **2. Anagrafiche** | contraente e, se diverso, intestatario del veicolo |
| **3. Veicolo** | marca, modello, allestimento, alimentazione, immatricolazione |
| **4. Situazione** | classe di merito, attestato di rischio, legge Bersani |
| **5. ARD/CVT** | le garanzie accessorie oltre alla RC |
| **6. Preventivo** | i premi delle compagnie, a confronto |
| **7. Modifica/Conferma** | si aggiusta e si conferma |

Lo stato di tutto sta in un oggetto solo, `AUTO_DATA`; il passo corrente in
`AUTO_STEP`. Ogni passo si disegna da `renderAutoStep()`.

**Il tipo di veicolo decide il percorso**: Autovettura, Motociclo, Autocarro,
Imbarcazione, Infortuni al conducente. Si arriva direttamente al prodotto giusto
con `?prod=<chiave>` (`autovetture`, `motocicli`, `autocarri`, `imbarcazioni`,
`conducente`).

---

## 3. Il recupero automatico — la parte che fa risparmiare tempo

Appena c'è una targa, partono **due ricerche in parallelo**, in sottofondo,
mentre la persona continua a compilare.

### 3.1 Il veicolo, dal portale Italiana

Uno scraper pilota il portale sulla targa e riporta marca, modello,
allestimento, alimentazione, immatricolazione. Ci mette **15-25 secondi**:
per questo parte subito e non blocca.

`AUTO_DATA.recuperoStato` racconta a che punto è — `in_corso`, `ok`, `vuoto` —
e un riquadro in cima allo step lo dice a chi guarda.

### 3.2 Il proprietario, dalla banca dati ANIA (via Allianz)

In parallelo si interroga l'**ANIA**: restituisce chi è intestatario del
veicolo, con il codice fiscale.

Serve soprattutto ai **rinnovi** e alle **volture**: si scopre chi è il cliente
senza chiederglielo.

### 3.3 Poi vince la nostra banca dati

Se quel codice fiscale è **già un nostro cliente**, vincono i **nostri** dati —
non quelli del portale. Il motivo: i nostri sono aggiornati (indirizzo,
recapiti, PEC), quelli del portale spesso no.

```
CF trovato ──► è nostro?  ──sì──► usa i NOSTRI dati
                   │
                   no
                   ▼
            nominativo nuovo ──► si CHIEDE se salvarlo come lead
```

### 3.4 Il lead non si salva più da solo

Fino al 3/8/2026 un nominativo nuovo finiva in archivio **all'istante**: chi
quotava una targa per curiosità, o per il cliente di un altro, si ritrovava una
scheda nuova senza averla chiesta.

Adesso resta **in attesa** e il riquadro offre «Salva come lead» / «Non
salvare». La scelta si può far ricordare, e quando si applica da sola il
riquadro lo dice.

---

## 4. Le garanzie

```js
AW_GARANZIE = [
  infortuniConducente, incendioFurto, attiVandalici, eventiNaturali,
  cristalli, collisione, casco, rinunciaRivalsa, assistenzaStradale
]
```

Per le autovetture due sono **accese in partenza**: *Infortuni conducente* e
*Rinuncia alla rivalsa*. È il pacchetto che l'agenzia propone di norma.

### Le dipendenze sono una regola assicurativa, non un vezzo

Alcune garanzie **richiedono Incendio e Furto come base**: Atti vandalici ed
Eventi naturali non esistono da sole. Se si mandano al portale senza la base,
la compagnia dà errore.

QUOTO le governa da sé: attivando una garanzia dipendente accende anche quella
richiesta; spegnendo *Incendio e furto*, spegne anche le sue dipendenti. Alla
compagnia arriva **sempre una combinazione valida**.

---

## 5. Come si arriva al premio

Ogni compagnia ha la sua funzione: `awPremioAllianz`, `awPremioAxa`,
`awPremioGroupama`, `awPremioHDI`, `awPremioPrima`. E ognuna la sua scheda di
risultato: `awPremioCard*`.

Le rotte del backend che il quotatore chiama:

```
/moto/hub-auto        recupero completo dei dati veicolo
/moto/hub-veicolo     solo il veicolo
/moto/ania            interrogazione ANIA per targa
/moto/premio          la quotazione
/moto/premio-tcm      quotazione TCM
/moto/preventivo      preventivo completo
/fonti/allianz/lookup interrogazione ANIA via Allianz
```

Il backend gira sulla VPS e a sua volta parla con gli scraper su `127.0.0.1`.
Il browser **non parla mai direttamente** con i portali delle compagnie.

### Prima è diversa

Prima non si quota da server: si quota con un'**estensione del browser**,
direttamente dal computer di chi lavora. Le funzioni `awPrima*` preparano la
richiesta nel formato che l'estensione si aspetta.

---

## 6. Le cose che si sbagliano, e come sono state chiuse

Ognuna viene da un guasto vero.

### 6.1 «Fatto» non si dice a vuoto

Un recupero che non trova niente **non deve** rispondere «ok» con i campi
vuoti. Casi chiusi da poco:

- `moto /lookup` diceva «fatto» con il veicolo **tutto vuoto** — il portale
  aveva cambiato le etichette e nessuno se ne accorgeva;
- `allianz /lookup` diceva «cercato, non trovato» anche quando il campo targa
  non era stato **nemmeno compilato**.

«Ho cercato e non c'è» e «non ho cercato» portano a due gesti diversi: il primo
si accetta, il secondo si va a guardare.

### 6.2 Il recupero non blocca mai la compilazione

Parte in sottofondo e non sovrascrive **mai** un campo già compilato a mano, né
un cliente già scelto. Chi sta scrivendo ha sempre ragione sul dato che arriva
dopo.

### 6.3 Il contesto del preventivo era una variabile fantasma

`flowCtx` non era dichiarata da nessuna parte: nasceva solo quando si apriva un
prodotto, e chiunque la leggesse prima trovava un errore secco. Adesso è
dichiarata.

### 6.4 Gli importi si scrivono in un modo solo

C'erano cinque formattatori diversi e trentasei `toFixed(2)` sparsi: lo stesso
premio compariva «€ 807.00» in una schermata e «807,00 €» in un'altra.

In un preventivo assicurativo quella è la differenza fra **ottocentosette euro
e ottocentosette centesimi**, letta di fretta. Adesso il numero si scrive in un
posto solo (`cifra()`), e `null` non diventa mai `0`: un importo che non c'è e
uno di zero euro sono due fatti diversi.

---

## 7. Dove si può migliorare

### 7.1 Cinque compagnie, cinque funzioni quasi uguali

`awPremioAllianz`, `awPremioAxa`, `awPremioGroupama`, `awPremioHDI`,
`awPremioPrima` fanno la stessa cosa in cinque modi. Aggiungerne una sesta
significa scrivere tutto da capo.

Un contratto comune — *prepara la richiesta*, *chiedi*, *leggi il premio*,
*disegna la scheda* — ridurrebbe ogni compagnia a un adattatore.

### 7.2 Il confronto non ordina, non normalizza

I premi si vedono uno accanto all'altro, ma **a parità di cosa?** Compagnie
diverse includono garanzie diverse nel prezzo base. Un confronto onesto
dovrebbe dire **a parità di quali garanzie**, e ordinare di conseguenza.

### 7.3 I 15-25 secondi del recupero

Sono tanti, e vengono dal pilotare un browser. Dove esistono API ufficiali
(HDI ne ha appena pubblicate 169) il tempo crolla e la fragilità sparisce.

### 7.4 Nessuna memoria delle quotazioni

Ogni preventivo riparte da zero. Non si sa quale compagnia vince più spesso su
quale profilo, né come si muovono i premi nel tempo. Sono i numeri che
servirebbero per decidere quale compagnia proporre per prima.

### 7.5 Il wizard non si può riprendere

Se si chiude la pagina a metà, si ricomincia. Un salvataggio del passo in corso
eviterebbe di ricompilare sette schermate.

### 7.6 Il tipo di veicolo condiziona troppo in silenzio

Autovettura, Motociclo, Autocarro, Imbarcazione e Infortuni al conducente
prendono strade diverse dentro le stesse funzioni, con controlli sparsi. È il
punto dove è più facile rompere un percorso mentre se ne sistema un altro.

### 7.7 Le dipendenze fra garanzie sono scritte una volta sola — per fortuna

Ma valgono per tutte le compagnie **per ipotesi**. Se una compagnia avesse una
regola diversa, oggi non ci sarebbe modo di dirlo.

---

## 8. Come si collauda

```bash
npx http-server -p 8077 &
node ui-test.mjs        # 177 prove Playwright, Supabase e API finti
```

Nessuna chiamata esce verso le compagnie: il collaudo gira su un finto
Supabase e con la rete bloccata.

### La regola

**Ogni prova nuova va fatta fallire sul codice di prima.** Una prova che passa
sia prima sia dopo non sorveglia niente.

```bash
git worktree add /tmp/prima origin/main --detach
cp ui-test.mjs /tmp/prima/
cd /tmp/prima && node ui-test.mjs   # le prove NUOVE devono essere ROSSE
```

---

## 9. Vincoli da rispettare in una proposta

1. **`index.html` è un file solo da 18.000 righe.** Non è un incidente: gira
   anche da telefono, senza compilazione. Ci si lavora **per numero di riga**,
   non con sostituzioni di testo — una `.replace()` su una stringa comune ne
   colpisce sette punti invece di uno.
2. **Il browser non parla con le compagnie.** Passa sempre dal backend.
3. **Non si dice «fatto» senza aver fatto** (§6.1).
4. **Il recupero non sovrascrive quello che una persona ha scritto.**
5. **Gli importi passano da `cifra()`.** Niente `toFixed(2)` crudi.
6. **Il codice è in italiano**: nomi, commenti, messaggi. I commenti dicono
   **perché**, non cosa.
7. **I messaggi d'errore dicono cosa fare.** Non «errore 502» ma «la sessione
   Allianz è scaduta: apri il Pannello Fonti e premi Verifica accesso».
8. **Non si inventano tariffe, soglie o percentuali.** Se un dato ufficiale
   manca, si chiede.

---

## 10. Glossario

| termine | significato |
|---|---|
| **ANIA** | la banca dati nazionale: da una targa dice chi è l'intestatario |
| **ARD / CVT** | le garanzie oltre alla RC (furto, incendio, kasko…) |
| **attestato di rischio** | il documento con la classe di merito e la storia dei sinistri |
| **legge Bersani** | permette di ereditare la classe di merito di un familiare |
| **voltura** | il passaggio di proprietà del veicolo |
| **rinuncia alla rivalsa** | la compagnia non si rivale sull'assicurato in certi casi |
| **classe di merito (CU)** | da 1 a 18: più bassa, meno si paga |
| **lead** | un nominativo senza privacy firmata: c'è in archivio ma non è ancora cliente |
| **fonte** | una compagnia interrogabile, con il suo scraper e le sue credenziali |
