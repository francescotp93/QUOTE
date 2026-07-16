# Scraper Quotiamo (portale comparatore proprio)

Clonato da `scraper/_template`. Micro-servizio Playwright + telecomando HTTP su **porta 5000**
(DISPLAY :90, VNC 5909). Credenziali/URL dal **Pannello Fonti** (fonte `c-quotiamo` / nome che matcha `quotiam`).

## Stato
- ✅ Login generico + sessione persistente + auto-relogin (3 min) + single-instance (flock).
- ✅ Endpoint standard: `/status` `/login` `/hub` `/hubveicolo` `/preventivo`.
- ⏳ **ADAPTER da mappare LIVE** (`recuperaVeicolo`, `recuperaAnagrafica`, `calcolaPremio`): tornano
  "non implementato" finché non si tarano su `/explore` + `/sniff` sul portale reale (§2.3 formati NORM).
- ⏳ `/explore` + `/sniff`: copiare gli strumenti generici da `scraper/italiana` in fase di mappatura.

## Wiring (nessuna modifica a fonti.js)
Il backend risolve i portali custom via `scraper_url`/`scraper_port` della fonte. Basta impostare
nella fonte Quotiamo del Pannello Fonti: **`scraper_port = 5000`** (o `scraper_url=http://127.0.0.1:5000`).

## Primo avvio (sul server, dopo merge nel branch di deploy)
`autopull` installa e avvia il servizio da solo (npm i + playwright + enable --now).
Primo login via VNC 127.0.0.1:5909 se l'auto-login non basta; la sessione resta in `userdata/`.
