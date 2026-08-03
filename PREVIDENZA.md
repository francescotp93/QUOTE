# Modulo Previdenza — pensione e TFR

> Calcolo del gap pensionistico, confronto TFR e analisi del welfare aziendale.
> Lato privato e lato azienda. Scritto per essere usato dall'agente davanti al
> cliente, con i numeri che si muovono mentre si parla.

---

## 1. Dove sta

| File | Che cosa fa |
|---|---|
| `previdenza-engine.js` | Il motore. Funzioni pure: niente DOM, niente rete, **nessun numero di legge cablato**. |
| `tariffe/previdenza-parametri.json` | Tutti i numeri di legge (aliquote, coefficienti, soglie). **È qui che si aggiorna il modulo ogni anno.** |
| `tariffe/previdenza-fondi.json` | Catalogo dei prodotti confrontabili + profili generici di ripiego. |
| `previdenza-ui.js` | L'interfaccia. Ricalcolo dal vivo, grafici ApexCharts, report stampabile, salvataggio. |
| `previdenza.css` | Stili del modulo (prefisso `.prv-`). Riusa le variabili di `index.html`. |
| `verifica-previdenza.mjs` | 100 prove sul motore, da riga di comando. |
| `verifica-previdenza-ui.mjs` | 38 prove sull'interfaccia in un browser vero. |

In `index.html` sono state toccate **cinque righe soltanto**: il `<link>` al CSS,
la voce in `MODULES`, la riga di instradamento in `openModule()`, i tre
contenitori di pagina e i due `<script>` in fondo. Nessuna riscrittura.

---

## 2. Come si usa

**Moduli → Previdenza** → si sceglie *Privato* o *Azienda*.

A sinistra ci sono i comandi, a destra i risultati. **Ogni modifica ricalcola
tutto all'istante**: è pensato per essere mosso davanti al cliente ("e se
andassi in pensione a 70 anni invece che a 67?").

### Privato
1. **Gap previdenziale** — ultimo stipendio netto contro pensione attesa, tasso
   di sostituzione, quanto mancherà ogni mese.
2. **Per colmare il gap** — quanto versare, quanto torna indietro di deduzione,
   quanto costa davvero.
3. **TFR: in azienda o nel fondo** — le due curve al netto delle imposte.
4. **Confronto tra le soluzioni** — i prodotti a catalogo, o i profili generici.

### Azienda
1. **Il TFR in azienda** — accantonamento, rivalutazione, imposta sostitutiva,
   e il bivio sopra/sotto i 50 dipendenti (Fondo di Tesoreria INPS).
2. **Vantaggi del conferimento** — deduzione aggiuntiva, esonero Fondo di
   garanzia, riduzione oneri impropri, in euro sull'organico reale.
3. **Quanto costa dare N € netti al dipendente** — busta paga contro fringe
   benefit contro previdenza contro premio di risultato.

Il pulsante **Salva analisi** scrive su `quote_preventivi` con
`modulo = 'previdenza'`, quindi l'analisi entra nel CRM come tutto il resto.
**Report per il cliente** apre una versione stampabile, grafici compresi.

---

## 3. Aggiornare i numeri ogni anno ← la cosa importante

**Non si tocca il codice.** Si apre `tariffe/previdenza-parametri.json`, si
aggiornano i valori e si alza `versione`.

Il file contiene in fondo una sezione `da_confermare` che elenca, uno per uno,
i numeri che vanno verificati sulle fonti ufficiali, con l'impatto di ciascuno.
In sintesi, ogni anno vanno ricontrollati:

- **Scaglioni IRPEF** — cambiano con le leggi di bilancio. Impatto **alto**:
  toccano sia il risparmio da deducibilità sia la tassazione del TFR.
- **Coefficienti di trasformazione** — rideterminati per decreto ogni biennio.
  Impatto **alto**: moltiplicano direttamente il montante per dare l'assegno.
- **Requisiti di pensionamento** — adeguamento alla speranza di vita.
- **Massimale contributivo INPS** — rivalutato ogni anno.
- **Tasso di capitalizzazione** — media quinquennale del PIL nominale ISTAT.
- **Premio di risultato** — tetto e aliquota sono stati più volte modificati.

I valori attualmente presenti sono stati messi come base di lavoro e **vanno
confermati da Francesco prima di mostrare risultati a un cliente**, coerentemente
con la regola di `CODEX.md`: le soglie non si inventano.

---

## 4. Aggiungere i prodotti reali (confronto multi-compagnia)

Oggi `tariffe/previdenza-fondi.json` ha l'array `prodotti` **vuoto**, quindi il
confronto gira sui *profili generici* — e l'interfaccia lo dichiara al cliente
con un avviso in chiaro. Non sono prodotti: sono ipotesi di mercato che servono
solo a mostrare l'ordine di grandezza.

Per mettere i prodotti veri:

1. Copiare il blocco `SCHEMA_PRODOTTO` dentro `prodotti`.
2. Compilarlo con i dati della **Scheda dei costi COVIP** del prodotto: ISC a
   2/5/10/35 anni, costi di gestione per linea, eventuale spesa di adesione.
3. Se è un fondo negoziale, indicare l'aliquota del contributo datoriale
   prevista dal CCNL.
4. Mettere `attivo: true`.

Appena c'è almeno un prodotto attivo il modulo **smette da solo** di usare i
profili generici, l'avviso sparisce e il confronto passa ai prodotti reali.
Nessuna modifica al codice.

I dati che servono sono elencati in `da_chiedere_a_francesco` dentro lo stesso file.

---

## 5. Le prove

```bash
node verifica-previdenza.mjs          # 100 prove sul motore, nessuna dipendenza

node static-server.js &               # 38 prove sull'interfaccia
npm i --no-save playwright apexcharts
node verifica-previdenza-ui.mjs
```

Il collaudo dell'interfaccia scopre la scocca dietro il login (il modulo calcola
in locale e non ha bisogno della sessione) e produce tre schermate in `/tmp`.

Le prove del motore non si limitano a controllare che i conti tornino: verificano
anche i **comportamenti attesi** — che il vantaggio del fondo cresca con
l'orizzonte, che l'autonomo abbia un tasso di sostituzione più basso del
dipendente, che una linea con rendimento netto negativo *non* risulti vincente,
che l'aliquota di prestazione scenda dal 15% al 9% e lì si fermi.

---

## 6. Due scelte che vale la pena conoscere

**Il grafico del TFR mostra il netto, non il lordo.** Sul montante lordo le due
curve sono quasi sovrapposte: la differenza tra lasciare il TFR in azienda e
conferirlo al fondo non nasce da come si accumula, ma da **come si tassa**
(aliquota media IRPEF contro il 15% che scende al 9%). Un grafico sul lordo
nasconderebbe esattamente il fatto che si vuole mostrare.

**C'è un presidio sulle ipotesi.** Il risultato della pensione pubblica è
dominato dal rapporto tra rivalutazione del montante e crescita della
retribuzione: se la prima supera la seconda, il tasso di sostituzione schizza
verso l'alto e il gap sparisce. È matematicamente corretto ma commercialmente
falso — e mostrare a un cliente "prenderai il 98% del tuo stipendio" è un danno
doppio, perché è sbagliato e perché uccide la consulenza. Quando succede
compare un'avvertenza in chiaro. Con ipotesi allineate il modulo restituisce
il ~75-80% che la letteratura previdenziale indica per un dipendente con 40
anni di contributi.

---

## 7. Che cosa NON fa (per ora)

- **Non calcola la rendita vitalizia con i coefficienti del prodotto.** Stima
  l'integrazione mensile distribuendo il capitale netto su 20 anni, e lo dice.
- **Non modella le detrazioni** per lavoro dipendente e carichi di famiglia: i
  netti reali sono più alti di quelli mostrati, sia oggi sia in pensione. È
  dichiarato tra le ipotesi.
- **La quota retributiva ante 1996** usa l'approssimazione standard del 2% per
  anno di anzianità, non il calcolo puntuale.
- **Non c'è ancora la versione pubblica** su `landing.html` per la raccolta
  contatti. Il motore è già pronto per servirla: è un file separato senza
  dipendenze dall'app, quindi la pagina pubblica dovrà solo caricarlo e
  costruirci sopra una form ridotta.
- **Non tocca IAM.** Il modulo vive dentro QUOTO; IAM continua ad aprirlo come
  fa con tutti gli altri moduli.
