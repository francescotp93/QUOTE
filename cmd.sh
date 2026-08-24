#!/usr/bin/env bash
# CHI NON ACCEDE? Interrogo lo /status di ogni scraper compagnia sul VPS
# (porte 4100-5000, solo locale) e riporto per ciascuno se è dentro al portale.
# Sola lettura: non tocca sessioni, non fa login.
set -u
declare -A P=( [24h/moto]=4100 [allianz]=4200 [italiana]=4300 [hdi]=4400 [groupama]=4500 [prima]=4600 [axa]=4700 [assieasy]=4800 [kube]=4900 [quotiamo]=5000 )
for nome in "${!P[@]}"; do
  porta=${P[$nome]}
  out=$(curl -s -m 8 "http://127.0.0.1:${porta}/status" 2>/dev/null)
  if [ -z "$out" ]; then printf '  %-12s (porta %s)  SERVIZIO SPENTO / non risponde\n' "$nome" "$porta"; continue; fi
  # estraggo i campi utili senza stampare dati sensibili
  logg=$(printf '%s' "$out" | grep -oE '"loggato"[: ]*[a-z]+' | head -1)
  step=$(printf '%s' "$out" | grep -oE '"step"[: ]*"[^"]*"' | head -1)
  url=$(printf '%s' "$out" | grep -oE '"url"[: ]*"[^"]*"' | head -1 | sed -E 's#(login|token|sess)[^"/]*#\1***#g')
  printf '  %-12s (porta %s)  %s  %s  %s\n' "$nome" "$porta" "${logg:-loggato:?}" "${step:-}" "${url:-}"
done
echo "(fine)"
