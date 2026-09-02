#!/usr/bin/env bash
# Groupama arriva fino a «chiedimi il codice»? (script corto: il canale taglia a 250s)
set -u
cd /opt/withus-backend || exit 1

git log --oneline -1
grep -c 'attendiSchermata' scraper/groupama/quote-service.mjs | sed 's/^/  attesa-vera nel file: /'
systemctl show groupama-scraper -p ActiveEnterTimestamp --value | sed 's/^/  acceso dalle: /'
systemctl restart groupama-scraper 2>/dev/null && echo "  riavviato"
sleep 20
echo

PRIMA=$(curl -s -m 8 http://127.0.0.1:4500/loginstate)
echo "partenza: $PRIMA"
curl -s -m 15 -X POST http://127.0.0.1:4500/accedi > /dev/null 2>&1
for i in $(seq 1 30); do
  sleep 5
  S=$(curl -s -m 6 http://127.0.0.1:4500/loginstate)
  [ "$S" = "$PRIMA" ] && continue
  PRIMA="$S"; echo "  $((i*5))s) $S"
  case "$S" in *attesa_otp*|*'\"loggato\"'*|*non_loggato*|*error*) break;; esac
done
echo
echo "== log =="
journalctl -u groupama-scraper --since "-4 min" --no-pager 2>/dev/null | grep -v 'systemd\[' | tail -18
