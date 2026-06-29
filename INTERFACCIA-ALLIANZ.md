# Preventivo Allianz (portale Matrix) — procedura ufficiale + note integrazione

Portale: `https://portaleagenzie.allianz.it/matrix/` (SPA). Login: vedi scraper `scraper/allianz`
(porta 4200) — login guidato dal pannello Fonti come AXA (`/accedi` + `/codice` Duo Mobile).

> A differenza delle altre compagnie, Allianz **non** quota da sola targa: richiede PRIMA
> l'anagrafica del cliente (CF), poi il flusso di emissione. Procedura fornita dall'agenzia:

## Fase 1 — ANAGRAFICA (creazione/conferma cliente)
1. Inserisci **cognome e nome** e premi Invio → verifica se il cliente è già censito.
2. Se non lo trovi → **Ricerca classica**.
3. Inserisci il **codice fiscale** (persona fisica; per giuridica passa all'apposita schermata) →
   **Ricerca** → in basso compare il soggetto → clic sul pulsante **+**.
4. Schermata anagrafica: **conferma i dati** trovati, inserendo **professione** e
   **Unità di mercato = `1019 - altro hh`**.
5. Scorri in basso → **Avanti**.
6. La **residenza** risulta già inserita (in rari casi manca la via).
7. Scorri in basso → **Avanti** (non inserire altro).
8. **Privacy e consensi**: non cliccare nulla, scorri in basso.
9. Scorri in basso → **Avanti**.
10. Schermata successiva: nulla → **Avanti**.
11. Attendi la **generazione della stampa**.
12. A stampa completata → **Continua**.
13. Anagrafica completata → sei sulla **scheda cliente** → clic su **Emissioni auto**.

## Fase 2 — PREVENTIVO (Emissione Motor)
14. Scorri su **Emissione** → **Preventivo Motor** (clic).
15. Schermata quotazione: chiede il **tipo veicolo** → **Auto** → scegli il tipo.
16. Inserisci la **targa** + **flag** "l'intermediario dichiara di aver reso al cliente
    l'informativa sul trattamento dei dati personali" → **Calcola**.
17. Dal **menu a tendina**: **modello** e **allestimento** → scorri in giù → **Avanti**.
18. A volte chiede se il proprietario dichiara di **non aver circolato** → **Sì**.
19. **Sì** → **Confermo**.
20. Clic sulla **freccetta** accanto a *RCA - Bonus/Malus unificata* → imposta il **massimale più basso**
    e la **guida** (Esperta se serve, altrimenti Libera).
21. Se servono **garanzie**: fleggale e inseriscile.
22. Vai su **Area riservata** per verificare la possibilità di **sconto**.
23. Es. sconto 10% → inseriscilo nell'apposito campo.
24. Scorri giù → **Aggiorna** → vedi il **premio totale annuo** con riduzione.
    ⚠️ La quotazione va **salvata SENZA sconto** → torna indietro con **Annulla**.
25. Clic su **Salva quotazione** (icona floppy disk).

## Note per l'integrazione QUOTO
- **Input dal preventivatore QUOTO** già disponibili: targa, CF/anagrafica contraente (recuperata da
  Plurima nei rinnovi → cognome/nome/CF/indirizzo), modello/allestimento (da Plurima), massimale, guida.
  Quindi la maggior parte dei dati che Allianz chiede li abbiamo già nel flusso auto.
- **Premio da leggere**: il "premio totale annuo" allo step 24 (config base, SENZA sconto applicato),
  coerente con come salviamo le altre compagnie.
- **Strada più robusta (consigliata):** catturare l'HAR di un preventivo reale su Matrix (F12 → Rete →
  Conserva log → fai un preventivo fino al premio → Salva HAR) per scoprire le chiamate API sotto la UI
  (come fatto per Plurima/Assieasy). Driverare 25 step di UI è molto più fragile delle chiamate dirette.
- **Unità di mercato** fissa: `1019 - altro hh`. Professione: dal dato anagrafico (o default sensato).
- Card preventivatore: logo `Allianz logo.png` (già su main), colore brand Allianz `#003781`.
