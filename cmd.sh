#!/usr/bin/env bash
# La catena intera: il merge e arrivato da solo? autopull ha riavviato? la sessione regge?
set -u
cd /opt/withus-backend || exit 1

echo "== versione arrivata DA SOLA (nessun git a mano qui) =="
git log --oneline -1
grep -c 'attendiSchermata' scraper/groupama/quote-service.mjs | sed 's/^/  attesa-vera nel file (atteso 5 con la PR 54): /'
echo

echo "== autopull ha riavviato da solo? =="
journalctl -u withus-autopull --since "-25 min" --no-pager 2>/dev/null | grep -iE 'riavviato|aggiorno|ATTENZIONE' | tail -12
echo

echo "== da quando sono accesi =="
for s in groupama allianz axa; do
  printf '  %-9s ' "$s"; systemctl show "${s}-scraper" -p ActiveEnterTimestamp --value
done
echo

echo "== stato dei tre portali =="
for p in 4500:groupama 4200:allianz 4700:axa; do
  echo "-- ${p#*:} --"; curl -s -m 15 "http://127.0.0.1:${p%%:*}/status" | head -c 420; echo
done
