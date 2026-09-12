Misurato sulla macchina prima di toccare il codice.

## AXA, tre difetti veri

**1. La sessione salvata non veniva mai riletta.** Stesso difetto chiuso su Groupama l'11/09, rimasto aperto qui. Il file era anche fermo al 2 settembre, perché si salvava solo al login: anche rileggendolo avremmo rimesso dentro cookie morti. Ora si rilegge all'accensione, si tiene fresco ogni 20 minuti e si salva prima di spegnersi.

**2. Il login del 12/09 è fallito e il giornale taceva.** Alle 07:55 «codice inserito OK», poi silenzio fino alla scadenza dell'attesa. Ora si scrive dove siamo finiti e cosa dice il portale (mai il contenuto dei campi), e il messaggio dice la cosa utile: il codice di AXA Guardian dura 30 secondi.

**3. Il seme TOTP veniva usato senza controllarlo.** Se in quel campo finisce il codice a 6 cifre (già successo su Allianz) si mandano passcode sbagliati al portale fino a far bloccare l'utenza dell'agenzia. La guardia di Allianz ora vale anche per AXA, su entrambe le vie.

## Groupama: il codice via email se lo prende da solo

Il codice arriva via email e la posta dell'agenzia il backend la legge già. Ora, quando il portale lo chiede, il backend lo cerca nella posta e lo consegna da sé. Il pannello non aspetta: risponde subito come prima.

Regole strette: solo i messaggi arrivati dopo l'avvio del login, solo dal dominio della compagnia, il codice non entra mai nel giornale, un messaggio già usato non si ripesca, e se manca la parola giusta accanto alle sei cifre non si indovina (il primo ripiego prendeva un numero di polizza: dopo tre tentativi falliti il freno chiude gli accessi). Se manca la casella o l'email non arriva, si torna a chiedere il codice a una persona.

Per AXA questo non si può fare: il suo secondo fattore è l'app sul telefono, non un'email. Lì la strada resta il seme TOTP salvato in Fonti.

In più, Groupama ora scrive quando cade la sessione e da quanto era attiva: serve a distinguere una sessione che scade per inattività da una con un tetto di durata fisso, che si curano in modo opposto.

## Come si annulla

`git revert` dei due commit: nessuna migrazione, nessun dato toccato.

## Prove

Ventidue nuove, tutte rosse sul codice in produzione. axa-sessione 9 verdi, otp-dalla-posta 13 verdi, suite scraper 16 verdi.
