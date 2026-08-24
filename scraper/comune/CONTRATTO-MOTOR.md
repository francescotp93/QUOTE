# Il contratto del motor (la parte che resta stabile)

Un adapter di compagnia riceve **un Preventivo** e restituisce **un Esito**.
Uguale per tutte le compagnie. Endpoint, mapping dei campi e sequenza dei passi
sono affari interni dell'adapter e non compaiono qui.

Definizione eseguibile + validazioni: [`contratto.mjs`](./contratto.mjs).
Prove: [`../verifica/contratto.test.mjs`](../verifica/contratto.test.mjs).

## Input — `Preventivo`

```
scenario : 'cambio_compagnia'        // attivo ora. Previsti (non ancora attivi):
                                     //   'bersani_stesso' | 'bersani_diverso' | 'rinnovo'
cliente  : { nome, cognome, dataNascita('YYYY-MM-DD'), codiceFiscale, email,
             telefono, statoCivile, professione, patenteAnno,
             indirizzo:{ via, civico, cap, comune, prov, istat } }
veicolo  : { targa, tipo: 'auto'|'moto'|'ciclomotore'|'autocarro' }
polizza  : { tipoGuida, massimale, frazionamento, rivalsa(bool), garanzie:[...] }
```

Obbligatori: `veicolo.targa`, `veicolo.tipo`, `cliente.dataNascita`.
`normalizzaInput()` accetta la roba com'è oggi (targa minuscola, `cf`,
`contraente`, `cellulare`, `tipoVeicolo`…) e la porta in questa forma.
`validaInput()` dice se è quotabile, con un **error_code della lista chiusa**.

## Output — `Esito`

Riuscito:
```
esito: 'ok'
compagnia, prodotto
premio: { annuo, rata, rate, frazionamento }     // l'annuo è la verità
garanzie_incluse: [...]
opzioni: [ { nome, premio_annuo } ]              // es. Incendio/Furto facoltativo
veicolo
```

Fallito:
```
esito: 'errore'
compagnia
error_code: INPUT_NON_VALIDO | SESSIONE | TIMEOUT | VEICOLO |
            RIFIUTO_COMPAGNIA | SCENARIO_NON_SUPP | PROVIDER
messaggio
passo: sessione | veicolo | anagrafica | quotazione | lettura_premio
```

`validaEsito()` rifiuta un `ok` senza premio valido (niente premi fantasma) e un
errore con un codice fuori lista.

## Logging strutturato dei fallimenti

`fallimento({ compagnia, passo, error_code, payload, rispostaGrezza, quando, ripulisci })`
salva le quattro cose che servono in manutenzione — **cosa** si è mandato,
**cosa** è tornato grezzo, **dove** si è rotto, **quando** — con i dati personali
oscurati (la ripulitura la fa `riservatezza.mjs`, passata come funzione).

## Estendibilità (fuori scope ora)

bersani e rinnovo sono già **valori previsti** di `scenario`: oggi
`validaInput()` li rifiuta con `SCENARIO_NON_SUPP`. Attivarli = spostarli in
`SCENARI_ATTIVI`. Nessun adapter va riscritto: è la prova che l'astrazione regge.

---

## Piano (dopo la validazione del contratto)

1. **Core condiviso** in `scraper/comune/` (accanto a `freno`/`esito`/…):
   esecuzione chiamate + retry/timeout + logging strutturato. Session/token
   restano dell'adapter (ogni compagnia si autentica a modo suo), ma il core
   offre l'esecutore comune.
2. **Adapter #1 = moto/24H**, avvolto intorno al flusso ESISTENTE senza
   toccarlo (`/api/quotation/v2/infobike/getdetail`, `/api/product/v2/get/mp/{weborderId}`).
3. **Adapter #2** minimo su un'altra compagnia (candidato: HDI via diretta, che
   ha già `/premio-motor`), come prova che il core non va modificato.
4. Rete di sicurezza: **manca un test di regressione del flusso moto**. Va
   creato PRIMA di rifattorizzare, perché il brief dice «se un test di
   regressione su MotoPlatinum non passa, fermati» — e oggi quel test non c'è.
