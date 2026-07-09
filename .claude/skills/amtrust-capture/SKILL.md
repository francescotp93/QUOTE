---
name: amtrust-capture
description: >
  Estrae e calibra le tariffe AmTrust (RC Professionale su QUOTO) a partire da
  una cattura HTTP del portale hdiservice. Usala quando Francesco carica una
  cattura di preventivi AmTrust (file tipo inliena.json) e serve: leggere i
  premi reali, capire i frazionamenti ammessi per prodotto, scoprire un premio
  minimo di polizza, e confrontare col nostro calcolo per correggere
  tariffe/amtrust.json. È lo strumento per "essere aggressivi" nell'estrazione API.
---

# AmTrust — estrazione tariffe da cattura hdiservice

## Cos'è
Il portale **hdiservice.com** quota AmTrust lato server: la formula NON è nel
codice della pagina, ma ogni preventivo lascia una traccia HTTP. Con **una sola
cattura per prodotto** possiamo solo leggere un punto (input→premio); con **più
catture dello stesso prodotto a fatturato crescente** possiamo dedurre la
regola completa (in particolare il **premio minimo di polizza**, che le schede
tariffa nominano ma spesso non stampano).

## Come catturare (Francesco, 2 minuti)
Sul portale, quotando un prodotto AmTrust, fai **3 preventivi dello stesso
prodotto** cambiando solo il **fatturato/compensi** (es. 50k, 300k, 800k),
stesso massimale. Salva la cattura (bookmarklet sniffer → file JSON) e passala.
Più punti = calibrazione esatta.

## Come analizzare
```
node .claude/skills/amtrust-capture/analizza-cattura.mjs <cattura.json> tariffe/amtrust.json
```
Lo script stampa:
- l'elenco degli endpoint (`/steps/N/parametri` = form input, `/steps/N/_varianti` = premio);
- per ogni preventivo: nome prodotto, **input** (fatturato/massimale/retro), **frazionamenti** offerti e **premi** (rate). Il premio ANNUO = card ANNUALE (o rata × n);
- **stima del premio minimo**: se lo stesso prodotto a fatturati diversi dà lo stesso importo → quello è il floor;
- **frazionamenti ammessi per prodotto** (alcuni prodotti hanno solo 2 rate, non 3);
- confronto col nostro `amtrust.json` (prodotti a tasso).

## Cosa fare col risultato
1. **Premio minimo** trovato → valorizza `premio_minimo_lordo` nel prodotto in
   `tariffe/amtrust.json`. Il codice (`index.html`, `amtRateCompute`) già applica
   il minimo: basta il dato, zero modifiche a index.html.
2. **Frazionamenti per prodotto** → se un prodotto ammette solo {Annuale,Semestrale},
   rendi `amtFrazSelectHTML` data-driven leggendo un campo `frazionamenti` dal JSON
   (fallback alle 3 rate se assente).
3. Ricontrolla il numero con un nuovo preventivo reale prima di considerarlo chiuso.

## Regola d'oro
**Non inventare numeri** (né minimi né tassi): se la cattura non basta, chiedi a
Francesco un'altra cattura o il Set Informativo del prodotto. Meglio un "mi
serve un dato" che una tariffa sbagliata mandata a un cliente.

## Mappatura prodotti portale ↔ nostri (nota importante)
Il portale vende **"AmTrust Strutture Sanitarie"** come **pacchetto unico**
(Poliambulatorio + Studi Dentistici + Residenze in un solo preventivo, con
fatturato unico), mentre QUOTO li tratta come **3 prodotti separati**. Quando
confronti i numeri, tienine conto: un premio del portale può coprire l'intero
bundle, non il singolo prodotto.
