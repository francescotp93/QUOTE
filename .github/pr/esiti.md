Prima revisione serale del registro degli esiti, sul primo preventivo vero (una targa, cinque compagnie). Due difetti trovati guardando le righe, non a tavolino.

## 1. Nel registro finivano dati del cliente (urgente)

La pulizia toglieva i dati personali quando erano campi di un oggetto. La risposta di HDI via browser porta però con sé la cattura di rete del portale: 106 chiamate, ognuna con il corpo scritto **dentro una stringa di testo**. Lì i campi non sono campi, sono testo, e la pulizia non li vedeva. In quattro di quei corpi c'era il codice fiscale del cliente, più nome, data di nascita e indirizzo. La riga pesava 77 KB.

Ora la pulizia guarda anche dentro il testo: se è un blocco JSON lo apre e lo ripulisce, e in ogni caso oscura codici fiscali, email e i valori dei campi vietati. Le catture di rete non entrano più affatto. Tre tetti: 60 elementi per lista, 2.000 caratteri per testo, 32 KB per riga. La stessa riga oggi pesa 208 byte e dice le stesse cose utili.

**Già fatto sul database:** la riga è stata ripulita la sera dell'11/09. Le altre quattro non contenevano dati personali.

## 2. Italiana in voltura: un minuto per una cosa decisa in partenza

In voltura l'anagrafica non arriva dall'attestato. Senza codice fiscale del contraente il portale si ferma sempre allo step Anagrafiche, ma ci mette 60 secondi e non dice cosa fare. Ora non si parte: messaggio che dice cosa fare e riga di registro immediata. Vale anche per la Legge Bersani. Il rinnovo non è toccato.

## 3. Perché HDI ha quotato dalla via lenta

Il premio è arrivato dal browser, quindi i miglioramenti sul prezzo rilasciati quella mattina non si sono applicati e il premio può essere più caro del preventivo fatto a mano. Il motivo della caduta non era ricostruibile perché il registro non lo conservava. Ora lo conserva.

## Come si annulla

`git revert` di questo commit: nessuna migrazione, nessun dato toccato dal codice.

## Prove

Otto nuove, tutte rosse sul codice in produzione (contrapprova eseguita). esiti 18 verdi, italiana-voltura 5 verdi, scraper 16 verdi. Le quattro `parita-*` rosse lo erano già su main (manca Playwright in sandbox).
