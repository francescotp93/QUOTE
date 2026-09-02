#!/usr/bin/env bash
# Allianz arriva fino a «chiedimi il codice»? (script corto: il canale taglia a 250s)
set -u
cd /opt/withus-backend || exit 1

git log --oneline -1
grep -c 'ricordaDispositivo' scraper/allianz/quote-service.mjs | sed 's/^/  ricorda-dispositivo nel file: /'
echo
echo "== conferma che Groupama e dentro =="
curl -s -m 15 http://127.0.0.1:4500/status; echo
echo

echo "== ALLIANZ: accedo =="
PRIMA=$(curl -s -m 8 http://127.0.0.1:4200/loginstate)
echo "partenza: $PRIMA"
curl -s -m 15 -X POST http://127.0.0.1:4200/accedi > /dev/null 2>&1
for i in $(seq 1 26); do
  sleep 5
  S=$(curl -s -m 6 http://127.0.0.1:4200/loginstate)
  [ "$S" = "$PRIMA" ] && continue
  PRIMA="$S"; echo "  $((i*5))s) $S"
  case "$S" in *attesa_otp*|*'\"loggato\"'*|*error*) break;; esac
done
echo
echo "== log Allianz =="
journalctl -u allianz-scraper --since "-4 min" --no-pager 2>/dev/null | grep -v 'systemd\[' | tail -16
