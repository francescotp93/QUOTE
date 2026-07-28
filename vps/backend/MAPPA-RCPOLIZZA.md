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

---

# APPROFONDIMENTO — tariffe, rami, compagnie (ricognizione read-only)

## 7. TARIFFE: non ci sono tariffari da copiare (verificato)
RC Polizza **non espone tabelle tariffarie**. È una piattaforma **broker a
richiesta-e-quotazione**: si compila un preventivo e sono le compagnie a quotarlo.
Lo dimostrano gli **stati del preventivo**:
`In attesa · Attesa documenti · Documenti ricevuti · Attesa pagamento ·
Pagamento ricevuto · Respinto · Completato · **Attesa quotazione** · Annullato · In sospeso`
I premi esistono solo **dentro i singoli preventivi/polizze** (colonne "Titoli | Premi"),
non come listino.

**Unica eccezione — "preventivazione autonoma":** cartella
`GUIDE/COMPAGNIE - Accesso alla preventivazione autonoma` → contiene **solo 2 guide**:
`GUIDA_EUROPASSISTANCE.PDF`, `GUIDA_METLIFE.PDF`. Solo per queste due si quota in autonomia.

## 8. RAMI trattati (40) — `select[name=id_ramo_url]`
ABITAZIONE · AMMINISTRATORI E DIRIGENTI (D&O) · ASSISTENZA STRADALE · C.A.R. ·
C.V.T. AUTO · CATASTROFI NATURALI AZIENDA CATNAT · CAUZIONI ·
COLPA LIEVE-CUMULATIVA DIP. P.A. · CYBER RISK · DECENNALE POSTUMA · E.A.R. ·
ERRORS & OMISSIONS · FURTO · GRANDINE · INCENDIO · INCENDIO E SCOPPIO (MUTUO) ·
INFORTUNI · LEASING · MALATTIA · MULTIRISCHI ENERGIE RINNOVABILI ·
MULTIRISCHI ANIMALI DOMESTICI · MULTIRISCHI COMMERCIO · MULTIRISCHI CONDOMINIO ·
MULTIRISCHI IMPRESA · MULTIRISCHI UFFICIO · PATRIMONIALE - C.G. DIP. PUBBLICI ·
PERDITE PECUNIARIE · POLIZZE EX LEGGE MERLONI · R.C.T./R.C.O. · RC FAMIGLIA ·
RC NATANTI · RC PROFESSIONALE · RC VETTORE STRADALE - DPC · RCA - LIBRO MATRICOLA ·
RCT TIROCINANTI · TUTELA AFFITTO · TUTELA LEGALE · VITA (CASO MORTE - PURO RISCHIO) ·
VITA (PIANO PENSIONE) · VIAGGI

## 9. COMPAGNIE disponibili: **224** — `select[name=id_compagnia]`
Tra cui: ALLIANZ (e varianti FIN/LT AGENCY/PZ/YOLO/DIRECT-RCA/VIVA-LIME), AXA
(SMI/PARTNERS/POLY/RCA), **AMTRUST** (DIRETTO, AGEO, ASSIMEDICI, BSA, CGE, EXECUTIVE,
POLY, RCP-CSA, SMI, SPA-BSA, YOUNG), ARAG, ARCH, ACCELERANT, AIG, BENE, BH ITALIA,
CATTOLICA, AVIVA, ASSIMEDICI-REVO, Aglea Salus, AFI-ESCA…
> È di fatto il **catalogo dei mandati** disponibili tramite RC Polizza.

## 10. Endpoint aggiuntivi trovati
```
/preventivi/assicurati-lista?page=1&perPage=25|50|100|250   → elenco assicurati (paginato)
/preventivi/contraenti-lista?page=1&perPage=…               → elenco contraenti (paginato)
/statistiche/produzione/preventivi                          → statistiche di produzione ✓
```
Filtri elenco preventivi: `id_stato[]`, `id_agenzia`, `id_compagnia`, `id_ramo`, `is_archiviato`.
Campi del nuovo preventivo: `assicuratore`, `tipo_preventivo`, `vendita_online`
(Vendita a distanza / in presenza), `nuovo-assicurato`, `stesso-contraente`,
`nuovo-contraente`, `id_ramo_url`, `id_categoria`.

## 11. Conclusione operativa
- ❌ **Niente tariffe** da importare in QUOTO da RC Polizza.
- ✅ Valore vero: **catalogo 224 compagnie × 40 rami**, anagrafiche clienti, polizze,
  rinnovi, sinistri, preventivi (con premi) e statistiche di produzione →
  materiale per il **CRM/portafoglio** di WITH US ONE, non per il quotatore.
