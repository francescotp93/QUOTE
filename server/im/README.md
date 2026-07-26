# server/im — Contabilità dell'intermediario (nucleo partita doppia)

Replica **funzionale** (non 1:1) del cuore contabile di AssiEasy: **Piano dei conti**,
**Causali** (template Dare/Avere), **Registrazione Movimenti** (prima nota) e **Quadratura**.

## Logica (il "ragionamento" di AssiEasy replicato)
- Ogni movimento è una **prima nota in partita doppia**: una **causale** definisce quali
  sottoconti vanno in Dare/Avere; l'operatore mette solo l'importo → le righe si generano bilanciate.
- Il **piano dei conti** porta la "natura" del conto via flag: `e_finanziario` (liquidità),
  `e_economico` (sospesi), `saldo_direzione` (debito v/compagnie), `abbuono`, `presente_quadratura`…
- La **quadratura** ("carta canta") aggrega i saldi per flag:
  - Saldo Finanziario = Finanziari − Saldo Compagnie → *"posso pagare i premi?"*
  - Saldo Economico = Saldo Finanziario + Economici → *"redditività se incasso i sospesi"*

## API (montate sotto `requireAuth`)
- `GET /im/piano-conti` · `GET /im/causali`
- `POST /im/movimenti` `{ causaleCodice, importo, dataMovimento }` → registra la prima nota
- `GET /im/movimenti?data=` · `GET /im/quadratura?data=`

## File
- `contabilita.js` — logica pura (`buildMovimentoRighe`, `computeQuadratura`) + helper Supabase.
- `route.js` — router `imRouter` (montato in `server/index.js`).

## ⚠️ Prerequisito (ZONA ROSSA — non applicare senza OK)
`supabase/im_contabilita.sql`: tabelle `im_piano_conti`, `im_causali(+righe)`,
`im_movimenti(+righe)` + **seed** (codifiche AssiEasy: 0601 cassa, 0602 banca/POS, 4101
saldo compagnia, 7101 provv. attive, 5702 spese, 5601 spese bancarie, 2301 ritenuta…;
causali reali: Reg. Spese Generali, Spese Bancarie, Versamenti, Provvigioni da compagnie,
Pagamento rimessa, Prelievo titolare). Idempotente, **non applicata**.

## Validato
Logica pura testata (dry): spesa 350 bilanciata; quadratura scenario incasso+sospeso →
finanziario −200, economico 0 (coerente con "carta canta").

## TODO / prossimi
- Modalità di pagamento multiple, abbuono automatico, PNT/rimesse.
- Collegare gli **incassi** (da SSF/IM) alla generazione automatica dei movimenti.
- Sospesi (scadenzario) ed estratti conto compagnie come layer sopra questo nucleo.
- Validare le convenzioni di segno della quadratura sui numeri reali di AssiEasy.
