#!/usr/bin/env bash
# READ-ONLY: stato login di ogni scraper via /status
set -u
declare -A PORT=( [24h/moto]=4100 [allianz]=4200 [italiana]=4300 [hdi]=4400 [groupama]=4500 [prima]=4600 [axa]=4700 )
for name in 24h/moto allianz italiana hdi groupama prima axa; do
  p=${PORT[$name]}
  body=$(curl -s --max-time 12 "http://127.0.0.1:$p/status" 2>/dev/null | head -c 400)
  printf "── %-10s (:%s) ──\n%s\n\n" "$name" "$p" "${body:-<nessuna risposta>}"
done
echo "FINE."
