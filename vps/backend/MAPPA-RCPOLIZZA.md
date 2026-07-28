# Mappa portale RC Polizza (`crm.rcpolizza.it`)

Ricostruita **dal VPS in sola lettura** (browser headless + credenziali salvate da Francesco
nel Pannello Fonti, fonte `c-rc-polizza`). Nessun dato creato/modificato/cancellato.

**Base URL:** `https://crm.rcpolizza.it/`
**Tecnologia:** applicazione **Laravel** (PHP) *server-rendered*: gli elenchi arrivano già
come HTML (niente chiamate dati in AJAX) → per leggerli servono **sessione + parsing tabella**.
**Raggiungibilità:** ✅ dal VPS (login HTTP 200). ❌ dalla rete delle sessioni Claude (403 policy).

## 1. Login
```
GET  /login          → form con campi:
     input[name=_token]    (CSRF Laravel, hidden)
     input[name=username]  (id=username)
     input[type=password]  (id=password)
     button[type=submit]   "Accedi"
POST /login          → sessione via cookie; redirect a "/" se ok
```
Nessun 2FA rilevato. Logout: `GET /logout`. Blocco schermo: `/lockscreen`.

## 2. Sezioni esistenti (verificate: HTTP 200 senza redirect a /404)
| Area | Percorso | Note |
|---|---|---|
| **CRM / Anagrafiche clienti** | `/anagrafiche-cli` | elenco clienti (tabella) |
| **Nuova anagrafica** | `/anagrafiche-cli-new/nuova` | form: Tipologia (Persona Fisica/Giuridica), Cognome, Nome, Luogo e Data di nascita, Sesso, Codice fiscale (+ "Calcolo inverso"), bottone **Crea** |
| **Polizze** | `/polizze` | portafoglio polizze |
| **Appendici** | `/appendici` | appendici/variazioni di polizza |
| **Rinnovi** | `/rinnovi` | scadenzario/rinnovi |
| **Sinistri** | `/sinistri/visualizza` | elenco sinistri |
| **Preventivi** | `/preventivi` | elenco preventivi (colonne: Titoli, Premi) |
| **Nuovo preventivo** | `/preventivi/nuovo` | parte dalla scelta anagrafica |
| **Utenti** | `/utenti` | gestione utenti/collaboratori |
| **Credenziali compagnie** | `/compagnie-ivass/credenziali` | credenziali per la preventivazione autonoma |
| **Documenti** | `/gestione-documentazione` | file manager (colonne: File, Utente, Dimensione, Ultima Modifica, Azioni); cartelle via `?dir=COMPAGNIE`, `?dir=NORMATIVE`, `?dir=PUBBLICA`, `?dir=GUIDE/...` |
| **Notifiche** | `/notifiche/visualizza` | comunicazioni della piattaforma |
| **Profilo / Preferenze** | `/gestione-profilo`, `/gestione-profilo/impostazioni` | |
| **Guide video** | `/guide/video`, doc esterna `doc.rcpolizza.it` | |

### Percorsi che NON esistono (danno /404)
`/scadenze` (usa **/rinnovi**), `/contabilita`, `/collaboratori` (usa **/utenti**),
`/estratto-conto`, `/statistiche`, `/provvigioni`, `/sinistri` (usa **/sinistri/visualizza**).
→ La **contabilità** come area a sé **non risulta presente** in RC Polizza.

## 3. API REST (`/api/v1/…`)
Poche, la piattaforma è server-rendered. Catturate finora:
```
GET  /api/v1/statistiche/dashboard        → numeri della dashboard
POST /api/v1/notifiche/aggiornaRichieste  → polling notifiche
```
> Da approfondire: le API usate dalle **azioni** (salva anagrafica, calcola preventivo,
> rinnova, carica documento) — si catturano compiendo l'azione, che in sola lettura non facciamo.

## 4. Colonne degli elenchi (utili per replicare le viste)
- **Anagrafiche clienti:** `ID | Categoria soggetto | Nominativo | Identificativo Fiscale |
  Residenza/Sede | E-mail | Cellulare/Telefono | Tipo | Stato | Azioni`
- **Documenti:** `File | Utente | Dimensione | Ultima Modifica | Azioni`
- **Preventivi:** `Titoli | Premi`

## 5. Come rifare la mappatura (dal VPS)
Script di ricognizione usato: `scraper/italiana/rc-probe.mjs` e `rc-deep.mjs`
(leggono le credenziali cifrate dal Pannello Fonti; la chiave `FONTI_SECRET` va presa
dal `.env` del backend, non dall'ambiente systemd).

## 6. Da completare
1. Colonne di **polizze / rinnovi / sinistri / utenti** (la tabella si popola dopo filtro).
2. Endpoint delle **azioni** (creazione anagrafica, preventivo, rinnovo).
3. Paginazione/filtri degli elenchi (parametri query).
