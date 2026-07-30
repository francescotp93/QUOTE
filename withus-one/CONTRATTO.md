# WITH US ONE — il contratto dei moduli

> Chi scrive un modulo legge **solo questo file** e il modulo di riferimento
> `moduli/scrivania.js`. Se una cosa non è scritta qui, non si inventa: si
> chiede.

## 1. Che cos'è questo sistema

Il gestionale di Withus Assicurazioni, riscritto **a moduli** invece che come
un unico file da 15.000 righe. L'ossatura funzionale segue quella dei portali
di settore (Plurima, AssiEasy): stesse aree, stessi flussi, stesse operazioni.
**La forma è nostra**: colori, testi, layout e codice sono di With Us. Non si
copia grafica, testi o codice di nessun altro.

Gira **senza compilazione**: moduli ES nativi, nessun npm, nessun passaggio di
build. Si pubblica copiando i file.

## 2. Le regole che non si discutono

1. **Italiano** ovunque: nomi di funzioni, variabili, commenti, testi a schermo.
2. **I commenti spiegano il perché**, non il cosa. Se una scelta è discutibile,
   il commento dice perché è stata fatta così.
3. **Niente dati inventati.** Soglie, tariffe, percentuali, durate: se il dato
   ufficiale non c'è, il campo resta vuoto e si mostra «da confermare».
   In contabilità questa regola non ha eccezioni.
4. **Solo lettura** salvo dove il modulo dichiara di scrivere. Ogni scrittura
   che tocca denaro o invii esterni chiede conferma con un riepilogo.
5. **Nessuna emoji** nell'interfaccia: solo icone Tabler (`<i class="ti ti-…">`).
6. **Mai il colore da solo**: ogni stato ha etichetta o spiegazione al passaggio
   del mouse. Un pallino senza legenda non è informazione.
7. **Le voci a zero non si mostrano.** Un elenco pieno di zeri è rumore.
8. **Nessuna chiave o segreto nel codice**: tutto ciò che è riservato passa dal
   backend (`ctx.api`).

## 3. Come è fatto un modulo

Un file in `moduli/<chiave>.js`. Esporta due cose e nient'altro:

```js
export const meta = {
  chiave: 'clienti',              // identificativo, = nome del file
  titolo: 'Clienti',              // titolo della barra
  sottotitolo: 'Anagrafiche e storia dei clienti',
  icona: 'ti-users',              // icona Tabler
  area: 'Portafoglio',            // area del menu: vedi §4
  permesso: null                  // null = tutti; oppure 'staff' | 'admin'
};

export async function monta(contenitore, ctx) {
  // disegna dentro `contenitore` (un <div> vuoto, già in pagina)
  // può essere async: il guscio mostra «carico…» finché non ritorna
}

export function smonta() {
  // facoltativa: si chiama quando si lascia il modulo.
  // Serve solo se il modulo ha lasciato acceso qualcosa (timer, sottoscrizioni)
}
```

Il guscio importa il modulo **solo quando serve** (`import()` dinamico): un
modulo che nessuno apre non viene nemmeno scaricato.

## 4. Le aree del menu

Ricalcano la separazione dei portali di settore, che è netta e non si
sovrappone — il cliente e i suoi contratti / i soldi / la mia posizione:

| area | contiene |
|---|---|
| `Scrivania` | il lavoro del giorno |
| `Preventivi` | catalogo prodotti, nuovo preventivo, preventivi salvati |
| `Portafoglio` | clienti, polizze, scadenzario, sinistri |
| `Contabilità` | titoli e quietanze, incassi, estratti conto |
| `Richieste` | ticket e richieste all'ufficio |
| `Amministrazione` | utenti, permessi, azienda |

## 5. Che cosa riceve il modulo (`ctx`)

```js
ctx = {
  db,        // client Supabase già autenticato (la riservatezza è quella del database)
  utente,    // { id, email, nome, ruolo, staff, admin }
  ui,        // i componenti condivisi: vedi §6
  fmt,       // formattatori: vedi §7
  api,       // chiamate al backend sul VPS: api.get(percorso), api.post(percorso, corpo)
  vaiA       // vaiA('clienti', { id: 'x' }) — apre un altro modulo
}
```

**Non si crea un secondo client Supabase** e **non si chiama `fetch` verso
Brevo o altri servizi**: si passa da `ctx.api`.

## 6. I componenti condivisi (`ctx.ui`)

Si usano questi. Non si reinventano tabelle e filtri in ogni modulo: è così che
nascono venti stili diversi per la stessa cosa.

| funzione | a che serve |
|---|---|
| `ui.tabella({ colonne, righe, disegna, vuoto, suRiga })` | tabella con intestazione e stato vuoto |
| `ui.filtri({ campi, suCambio })` | barra filtri (testo, select, data) + Azzera |
| `ui.fasce({ voci, scelta, suScelta })` | le fasce numeriche cliccabili in testa |
| `ui.totali(voci)` | la riga dei totali sotto la tabella |
| `ui.badge(testo, tipo)` | etichetta di stato: `ok` `attesa` `male` `neutro` |
| `ui.semafori(voci)` | i pallini di stato, ognuno con la sua spiegazione |
| `ui.modale({ titolo, corpo, azioni })` | finestra |
| `ui.conferma({ titolo, testo, parola })` | conferma; con `parola` obbliga a scriverla |
| `ui.vuoto(testo)` | il messaggio di elenco vuoto |
| `ui.attesa(testo)` | il messaggio di caricamento |
| `ui.esporta(nome, colonne, righe)` | esportazione Excel |
| `ui.errore(contenitore, e)` | messaggio di errore leggibile |

Ogni elenco **deve** avere l'esportazione: se una lista non si può esportare,
qualcuno la ricopia a mano.

## 7. I formattatori (`ctx.fmt`)

`fmt.euro(n)` · `fmt.data(v)` · `fmt.dataOra(v)` · `fmt.giorni(data)` ·
`fmt.numero(n)` · `fmt.esc(testo)` (sempre, su qualunque testo che arriva dal
database).

## 8. I dati

Tabelle Supabase esistenti, già popolate e con la riservatezza attiva:

| tabella | contenuto |
|---|---|
| `quote_anagrafiche` | clienti |
| `quote_preventivi` | preventivi |
| `quote_prodotti_catalogo` | catalogo prodotti (`tipo_quotazione`, `durata_mesi`) |
| `quote_polizze` | polizze, con i **quattro stati indipendenti** |
| `quote_titoli` | le rate |
| `quote_pratica_documenti` | documentale di pratica |
| `quote_sinistri` + `quote_sinistro_controparti` + `quote_sinistro_partite` | sinistri |
| `iam_ticket` | coda unica dei ticket |
| `iam_utenti` | utenti e permessi |
| `quote_scadenzario` (vista) | polizze con giorni alla scadenza e stato rinnovo |

**Non si creano tabelle nuove** senza che sia scritto nel compito.

I quattro stati della polizza, sempre in quest'ordine: **pagamento ·
perfezionamento · rendicontazione · copertura**.

## 9. Come si verifica

Ogni modulo porta il suo file di prove in `verifica/<chiave>.test.mjs`, che
gira senza browser e senza database: si esaminano il file del modulo e le sue
funzioni pure. Le prove devono coprire almeno:

- il modulo esporta `meta` e `monta`, e `meta` ha tutti i campi;
- rispetta le regole del §2 che si possono verificare leggendo il file
  (niente emoji, niente `fetch` diretti, niente chiavi, italiano);
- la logica di calcolo del modulo (se ne ha) sui casi limite.

Si lancia con `node withus-one/verifica/controlla.mjs`.
