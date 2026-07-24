# server/ssf — Adapter flussi SHARE/SSF V12

Parser + mapping dei flussi **SHARE / SSF V12** delle compagnie (via AssiEasy)
verso gli schemi Withus. Alimenta il **portafoglio certo**: un solo flusso porta
anagrafiche, polizze (con veicolo/RCA), garanzie, titoli e incassi.

- `ssfParser.js` — legge lo ZIP/cartella dei `REC0xx_*.csv`, ricostruisce l'albero
  `anagrafica -> polizza -> (veicolo, garanzie, titolo -> incasso)`. Viste `toQuotoView()`/`toImView()`. Zero dipendenze.
- `mapWithus.js` — trasformazione **pura** (no scrittura DB) verso le righe di
  `quote_anagrafiche`, `quote_polizze`, `im_titoli`, `im_incassi` (date `YYYY-MM-DD`,
  importi numerici, cognome/nome via `LUNGHEZZA_COGNOME`, consensi GDPR).

## Migrazione richiesta (⚠️ ZONA ROSSA — non applicare senza OK)
`supabase/ssf_schema_extensions.sql` aggiunge le colonne SSF (`ssf_id_*`, consensi,
veicolo/RCA) e le tabelle `im_titoli`/`im_incassi`. Solo committata, **non applicata**.

## Da completare
- Servizio/endpoint di import (upsert idempotente per `ssf_id_*`), schedulato (~04:00).
- Code list ufficiali SSF V12 per decodificare i campi `*_SHARE` (classe RCA, stato titolo, mezzo pagamento…).
- Convalida: il parser è già stato provato su un flusso PRIMA reale (39 anagrafiche, 34 polizze, 19 titoli, 52 incassi — tutti agganciati).

Stato/piano completo nei doc di progetto: `assieasy-share-tracciato-ssf`, `assieasy-ssf-integrazione`.
