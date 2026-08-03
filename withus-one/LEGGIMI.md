# WITH US ONE

Il gestionale di Withus Assicurazioni, ricostruito da capo **accanto** a quelli
che già girano — non al posto loro. IAM e QUOTO restano in produzione e
intatti: questo si costruisce in parallelo e si guarda quando è pronto.

## Che cosa è, e che cosa non è

**È**: l'ossatura funzionale dei portali di settore (Plurima, AssiEasy) —
stesse aree, stessi flussi, stesse operazioni, la stessa idea di gestionale.
Quelle sono pratiche di mestiere e si possono seguire.

**Non è**: una copia di quei portali. Grafica, testi, layout e codice sono
nostri. Stessa ossatura, pelle With Us.

## Come si apre

```
node static-server.js &
```
poi `http://127.0.0.1:8077/withus-one/index.html`

In produzione basta copiare la cartella: **non c'è compilazione**, nessun npm,
nessun passaggio di build. Sono moduli JavaScript nativi, li carica il browser.

## Perché a file separati

I due sistemi di oggi sono due file HTML da 11.500 e 15.100 righe. Funzionano,
ma ogni modifica è una modifica al file intero, e due persone non possono
lavorarci insieme. Qui ogni pagina è un file suo di poche centinaia di righe,
con le sue prove accanto. È questo che rende possibile costruire in parallelo.

## Com'è fatto

```
withus-one/
  index.html          la pagina di partenza: nessuna logica dentro
  CONTRATTO.md        quello che legge chi scrive un modulo
  nucleo/
    dati.js           un solo collegamento a Supabase e al backend
    formato.js        soldi, date, giorni: scritti in un posto solo
    ui.js             tabella, filtri, fasce, finestre, esportazione
    registro.js       l'elenco dei moduli e il menu
    router.js         l'indirizzo (#/clienti?id=x) è la verità
    avvio.js          accesso, scocca a tre fasce, montaggio dei moduli
  moduli/             una pagina per file
  stili/
    token.css         i colori del marchio: solo qui
    base.css          scocca e componenti
  verifica/           le prove
```

## Le pagine

| area | pagina | che cosa fa |
|---|---|---|
| Scrivania | Scrivania | insoluti, rate, scadenze, documenti mancanti e richieste in un solo elenco ordinato per urgenza |
| Preventivi | Prodotti | catalogo: come si quota ogni prodotto e quanto dura |
| Preventivi | Preventivi | le quotazioni salvate, con quelle da riquotare e la resa |
| Portafoglio | Clienti | anagrafiche e **storia** del cliente su una linea del tempo |
| Portafoglio | Polizze | i **quattro stati** indipendenti di ogni contratto |
| Portafoglio | Scadenzario | chi scade e quando, con lo stato del rinnovo |
| Portafoglio | Sinistri | fascicolo con controparti e partite di danno |
| Contabilità | Titoli | rate, quietanze, incassato e ancora da incassare |
| Richieste | Richieste | la coda verso l'ufficio, ordinata per urgenza e attesa |
| Amministrazione | Collaboratori | chi vede cosa: ruolo scritto e ruolo che conta davvero |

Tutte in **sola lettura**. Il sistema mostra e mette in fila; le scritture — e
soprattutto quelle che toccano denaro o invii — si aggiungono una alla volta,
ognuna con la sua conferma.

## Le prove

```
node withus-one/verifica/controlla.mjs
```

279 controlli su 14 file. Tre valgono per ogni modulo automaticamente, anche
per quelli scritti domani: il rispetto del contratto, l'esistenza di ogni nome
importato, e l'apertura in un browser vero di **ogni** voce del menu.

Quest'ultima è nata da un errore vero: il guscio importava un nome che non
esisteva e la pagina restava bianca, mentre tutte le altre prove erano verdi
perché nessuna caricava il guscio.

## Che cosa manca ancora

- **Provvigioni**: percentuali e regole di rendicontazione. Senza il dato
  ufficiale il terzo semaforo dice solo «rendicontata sì / no» e gli estratti
  conto non si possono fare. Non si inventa.
- **Documenti che perfezionano una polizza**: l'elenco per prodotto.
- **Durata dei prodotti vita** (TCM, Vita/Risparmio).
- Le scritture: emissione, incasso, apertura sinistro, nuova richiesta.
