# Mappa portale Plurima / Italnext (`portale.plurima.net`)

Ricostruita in **sola lettura** dal VPS via l'endpoint `/explore` dello scraper Italiana
(porta 4300), sessione reale loggata. Nessun dato modificato.

**Base URL:** `https://portale.plurima.net/`
**Login:** `GET /login.php` → form utente/password (+ eventuale passcode 2FA).
La landing pubblica NON ha il form: si va a `/login.php`. Sessione via cookie.
**Intermediario (nostro):** `id_intermediario=3489`.

## Cuore tecnico: una sola API
Quasi tutto passa da **`POST /a__php/__ajax.php`** con parametro **`a=<azione>`**
(`application/x-www-form-urlencoded`, header `X-Requested-With: XMLHttpRequest`, risposta JSON).
Nel codice dello scraper è la funzione `ajaxPlurima(action, params)` / `plurimaAjax()`.
Gli elenchi (polizze, estratti conto) sono **DataTables server-side**: stessa URL
`__ajax.php` con i parametri standard `draw`, `columns[..]`, `start`, `length`, `search[value]`.

## Menu principale (18 voci) e sezioni
| Voce | URL | Note |
|---|---|---|
| Prodotti | tendina | catalogo prodotti (vedi sotto) |
| Preventivi | `javascript` | scorciatoie preventivo |
| Richieste | `/richieste` | ticket/richieste |
| Portafoglio | tendina → `/il-tuo-portafoglio` | |
| Utilità | tendina | |
| Amministrazione | tendina | **gestione (collaboratori?) — DA APPROFONDIRE** |
| Polizze emesse | `/polizze` | elenco polizze |
| Fai un preventivo | `/preventivazione` | preventivatore (selettore `id_prodotto`) |
| Chiudi estratto conto | `/estratti-conto` | **contabilità** |
| Gestire i rinnovi | `/scadenze` | **scadenzario** |
| Il tuo portafoglio | `/il-tuo-portafoglio` | sospesi/portafoglio |
| Provvigioni da rendicontare | `mostraProvvigioniDaRendicontare()` | provvigioni |

## Azioni `a=` catturate per sezione
- **Home / dashboard:** `dashboard_tisuggeriamo`, `dashboard_promoegare`,
  `dashboard_inostriconsigli`, `dashboard_news`, `dashboard_ituoinumeri`
  (tutte con `&id_intermediario=3489`).
- **Scadenze (`/scadenze`):** `a=carica_scadenze`, `a=get_job`.
  Filtri UI: `TRSel_scadenze` (ramo/tipo), `ProdottoSel_scadenze` (prodotto),
  tabella `tabella_scadenze` (DataTable).
- **Portafoglio (`/il-tuo-portafoglio`):** `a=sospesi_contraente`.
- **Polizze (`/polizze`):** DataTable server-side `table-gestione_polizze` →
  `POST __ajax.php` con `draw=1&columns[0][data]=numero_polizza&...` (elenco polizze).
- **Estratti conto (`/estratti-conto`):** DataTable `table_estratti` (carica su interazione/tab).
- **Richieste (`/richieste`):** filtri `campo_nominativo`, `campo_pianificati`,
  `campo_tipologia`, `campo_stato`; tabella `tabella_ticket`.

## Catalogo prodotti (tendina Prodotti → `/dettaglio_prodotti?id=<X>&tariffa=<X>`)
RC Professionale "Scudo Professionale" e AmTrust:
- `id=120` Colpa grave / Medico / Professioni sanitarie / Colpa Grave Extra / Medico Under 35
- `id=118` Professioni Economiche
- `id=119` Professioni Giuridiche / Professioni intellettuali
- `id=168` AmTrust Pubblico impiego

## Catalogo azioni `a=` (estratte dai JS: ajax.js, custom.js, index.js, carrello.js, preventivatore_auto.js)
> Nota: `/jsgrep` limita a 8 match/file, quindi l'elenco è **parziale** (le azioni delle
> pagine gestionali caricano JS propri). Va completato caricando il JS di ogni sezione.

- **Preventivatore:** `calcola_preventivo`, `carica_dati_preventivatore`, `carica_campi`,
  `carica_allestimenti`, `carica_modelli`, `carica_comuni_istat`, `carica_attestato_rischio`,
  `recupera_situazione_assicurativa`, `recupera_tipo_documento_file`, `rifiuta_proposte`,
  `verifica_fea_documenti_polizza`, `reset`
- **CRM / anagrafiche:** `cerca_anagrafica`, `gestisci_indirizzo_plurima`
- **Scadenze:** `carica_scadenze`  ·  **Portafoglio:** `sospesi_contraente`
- **Notifiche:** `get_notifiche_comunicazioni`  ·  **Job async:** `get_job`, `abort_job`
- **Dashboard:** `dashboard_tisuggeriamo`, `dashboard_promoegare`, `dashboard_inostriconsigli`,
  `dashboard_news`, `dashboard_ituoinumeri`

### Forma dati verificata (via `/api`)
- `carica_scadenze` → `{error,message,data:{data:[ {id, id_intermediario, nome_intermediario,
  ticket_polizza, numero_polizza, envelope_precontrattuale, ...} ]}}` (lista polizze in scadenza reali)
- `sospesi_contraente` → `{totale:"0,00 €", num_titoli_totali:"0"}`
- `dashboard_ituoinumeri` → `{error,message,data:[{icona,testo,link,badge}]}`

## DA APPROFONDIRE (prossima carrellata mirata)
1. Tendina **Amministrazione** → voci reali (gestione **collaboratori**/struttura).
2. Endpoint-dati esatto di **estratti-conto** (contabilità) — serve un click sul tab/tabella.
3. Azioni di **dettaglio** per singola polizza / singolo estratto conto / singola scadenza.
4. Endpoint **provvigioni da rendicontare** (`mostraProvvigioniDaRendicontare`).

## Come replicare le chiamate (dal VPS, sola lettura)
Lo scraper Italiana (porta 4300) espone:
- `GET /status` → stato login.
- `GET /explore?goto=<path>&sniff=1` → struttura pagina + azioni `__ajax.php`.
- `GET /explore?click=<testo>&sniff=1` → clicca voce/menu e sniffa.
- `GET /api?action=<a>&<param>=<val>` → chiama direttamente un'azione `__ajax.php` e torna il JSON.
