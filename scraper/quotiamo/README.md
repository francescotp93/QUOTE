# Scraper Quotiamo

Micro-servizio Playwright con telecomando HTTP locale (porta **4400**). Stesso pattern
di `scraper/italiana`, motore in `quote-service.mjs` (condiviso/generico, config via ENV
in `start-service.sh`).

## Stato
- ✅ Login generico + sessione persistente + keep-alive.
- ✅ Endpoint: `/status`, `/login`, `/logindump`, `/nav?path=..|url=..`, `/shot`.
- ⏳ **Mappatura wizard preventivo DA FARE live**: stack/portale da verificare. I selettori
  vanno tarati con `/logindump` e `/nav` sul server reale, poi si aggiunge lo step-by-step.

## Config
Il link di accesso e le credenziali arrivano dal **Pannello Fonti** (fonte con nome che
matcha `quotiam`). Nessun segreto in questo repo.

## Primo avvio (sul server)
```
cd /opt/quote/scraper/quotiamo && npm i && bash start-service.sh
```
Primo login manuale via VNC 127.0.0.1:5903 (tunnel SSH), poi la sessione resta in `userdata/`.
