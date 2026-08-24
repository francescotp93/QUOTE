#!/usr/bin/env bash
# AUDIT porte scraper: cosa cerca il backend (env) vs cosa e' davvero in ascolto,
# e lo stato di ognuno. Sola lettura. Default attesi (PORTALI): 24h4100 allianz4200
# italiana4300 hdi4400 groupama4500 prima4600 axa4700 assieasy4800 kube4900 quotiamo5000
set -u
PID=$(systemctl show withus-backend -p MainPID --value 2>/dev/null)
echo "== *_SCRAPER_URL nell'ambiente del backend (PID $PID) =="
tr '\0' '\n' < "/proc/$PID/environ" 2>/dev/null | grep -E '_SCRAPER_URL=' | sort
echo "== porte in ascolto (41xx-50xx) =="
ss -ltnp 2>/dev/null | grep -oE '127.0.0.1:(4[0-9]{3}|50[0-9]{2})' | sort -u
echo "== stato /loginstate per ogni porta in ascolto =="
for p in 4100 4200 4300 4400 4500 4600 4700 4800 4900 5000 4401 4501 4601 4701; do
  ss -ltnp 2>/dev/null | grep -q "127.0.0.1:$p " || continue
  st=$(curl -s -m 6 "http://127.0.0.1:$p/loginstate" 2>/dev/null | grep -oE '"step":"[^"]*"' | head -1)
  lg=$(curl -s -m 6 "http://127.0.0.1:$p/status" 2>/dev/null | grep -oE '"loggato":[a-z]+' | head -1)
  echo "porta $p -> ${st:-(no loginstate)} ${lg}"
done
echo "(fine)"
