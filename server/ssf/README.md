# server/ssf — Adapter flussi SHARE/SSF V12

Parser + mapping + import dei flussi **SHARE / SSF V12** delle compagnie (via AssiEasy)
verso gli schemi Withus. Alimenta il **portafoglio certo**: un solo flusso porta
anagrafiche, polizze (con veicolo/RCA), garanzie, titoli e incassi.

## Moduli
- `ssfParser.js` — legge lo ZIP/cartella dei `REC0xx_*.csv`, ricostruisce l'albero
  `anagrafica -> polizza -> (veicolo, garanzie, titolo -> incasso)`. Viste `toQuotoView()`/`toImView()`.
- `mapWithus.js` — trasformazione **pura** verso le righe di `quote_anagrafiche`,
  `quote_polizze`, `iam_titoli`, `iam_incassi` (date `YYYY-MM-DD`, importi numerici,
  cognome/nome via `LUNGHEZZA_COGNOME`, consensi GDPR).
- `importService.js` — **upsert idempotente** su Supabase (PostgREST `merge-duplicates`)
  per chiave `ssf_id_*`; risolve `anagrafica_id` (FK) dal `ssf_id_anagrafica`. `fetch`
  iniettabile per test/dry-run. Rieseguibile sui flussi giornalieri senza duplicare.
- `route.js` — `ssfRouter` (montato in `server/index.js` sotto `requireAuth`):
  - `POST /ssf/parse`  `{ cartella }` → conteggi del flusso (DRY, nessuna scrittura).
  - `POST /ssf/import` `{ cartella }` → import (upsert) su Quoto/IM.
  `cartella` = sottocartella dell'inbox `SSF_INBOX_DIR` (default `/tmp/ssf-inbox`) coi
  `REC*.csv` gia estratti; risolta dentro l'inbox (niente path traversal).

## Stato
- Parser+mapping **validati sul flusso PRIMA reale** (39 anagrafiche/34 polizze/87 garanzie/19 titoli/52 incassi, tutti agganciati).
- importService **validato in dry-run** (fetch mock): sequenza + risoluzione FK + idempotenza OK.

## ⚠️ Prerequisito (ZONA ROSSA — non applicare senza OK)
`supabase/ssf_schema_extensions.sql` aggiunge le colonne SSF (`ssf_id_*`, consensi,
veicolo/RCA) e le tabelle `iam_titoli`/`iam_incassi`. Solo committata, **non applicata**.
Finche non e applicata, `POST /ssf/import` fallisce (colonne mancanti).

## TODO
- Upload multipart + unzip del file compagnia (oggi l'estrazione e a monte/ops; niente dep zip nel backend).
- Scheduler ~04:00 (il flusso arriva di notte).
- Staff-gating (oggi solo `requireAuth`, come /crm).
- Code list ufficiali SSF V12 per decodificare i campi `*_SHARE`.

Doc di progetto: `assieasy-share-tracciato-ssf`, `assieasy-ssf-integrazione`.
