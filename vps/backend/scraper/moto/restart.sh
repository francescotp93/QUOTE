#!/usr/bin/env bash
# Riavvio pulito dello scraper moto: spegne ogni istanza, riaccende, verifica.
# Uso: ./restart.sh   (dalla cartella scraper/moto)
cd "$(dirname "$0")"
echo "▶ Spengo lo scraper (e il browser)…"
pkill -9 -f quote-service.mjs 2>/dev/null || true
pkill -9 -f ms-playwright     2>/dev/null || true
pkill -9 -f chromium          2>/dev/null || true
sleep 3
echo "▶ Riavvio in background…"
setsid nohup ./start-service.sh >/tmp/moto.log 2>&1 </dev/null &
sleep 13
echo "----- LOG -----"
tail -5 /tmp/moto.log
echo "----- STATUS -----"
curl -s localhost:4100/status || echo "(non ancora pronto, riprova tra qualche secondo)"
echo ""
