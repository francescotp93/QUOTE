# server/quoto — Portafoglio (scadenzario + CRM opportunità)

Replica **funzionale** di AssiEasy lato Quoto: **Avvisi di scadenza / rinnovi** e
**CRM opportunità** (cross-selling "Clienti auto senza tutela/infortuni"). Lavora su
`quote_polizze` / `quote_anagrafiche`. ESM.

## API (sotto `requireAuth`)
- `GET /quoto/scadenzario?dal=&al=` — polizze in scadenza nel periodo (default prossimi 60 gg) → motore rinnovi.
- `GET /quoto/mora` — polizze scadute ancora attive.
- `GET /quoto/opportunita?copertura=tutela` — clienti con auto **senza** quella copertura (es. `tutela`, `infortun`) → lista per il cross-selling.

## Logica
- `clientiSenzaCopertura(auto, copertura)` (pura, testata): clienti unici con una polizza auto/motor attiva che **non** hanno una polizza della copertura target.
- Match per `ramo`/`prodotto` via `ilike` (auto/motor; tutela/infortuni…).

## ⚠️ Prerequisito
`quote_polizze` applicata (supabase/quote_polizze.sql, zona rossa). Con più dati di
garanzia (dai flussi SSF) il cross-selling potrà scendere a livello di singola garanzia.
