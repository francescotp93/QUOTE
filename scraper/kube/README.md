# Scraper Kube (K-UBE di Koala srl)

Micro-servizio Playwright con telecomando HTTP locale (porta **4900**). Stesso pattern
di `scraper/italiana`, motore in `quote-service.mjs` (condiviso/generico, config via ENV
in `start-service.sh`).

## Stato
- ✅ Login generico + sessione persistente + keep-alive.
- ✅ Endpoint: `/status`, `/login`, `/logindump`, `/nav?path=..|url=..`, `/shot`.
- ⏳ **Mappatura wizard preventivo (auto/moto/truck) DA FARE live**: Kube è Blazor Server
  (DOM pilotato via socket SignalR, non REST). I selettori vanno tarati con `/logindump`
  e `/nav` sul server reale, poi si aggiunge lo step-by-step del preventivo.

## Config
Il link di accesso e le credenziali arrivano dal **Pannello Fonti** (fonte con nome che
matcha `kube|k-ube|koala`). Nessun segreto in questo repo.

## Primo avvio (sul server)
```
cd /opt/quote/scraper/kube && npm i && bash start-service.sh
```
Primo login manuale via VNC 127.0.0.1:5905 (tunnel SSH), poi la sessione resta in `userdata/`.
