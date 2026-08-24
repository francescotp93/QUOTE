#!/usr/bin/env bash
# Il backend che vede HDI e' lo stesso 127.0.0.1:4400 che vedo io? (sola lettura)
set -u
echo "== servizio backend: porta + env scraper =="
systemctl show withus-backend -p ExecStart -p Environment 2>/dev/null | tr ' ' '\n' | grep -iE "SCRAPER|PORT|ExecStart|MAIL|API" | head -20
PID=$(systemctl show withus-backend -p MainPID --value 2>/dev/null)
echo "PID backend: $PID"
if [ -n "$PID" ] && [ -r "/proc/$PID/environ" ]; then
  echo "env (SCRAPER/PORT):"; tr '\0' '\n' < "/proc/$PID/environ" 2>/dev/null | grep -iE "SCRAPER|^PORT=|HDI|MOTO|ALLIANZ" | sed -E 's/(TOKEN|SECRET|KEY|PASS)[^=]*=.*/\1=***/I' | head
fi
echo "== chi ascolta su 4400 e sulla porta backend =="
ss -ltnp 2>/dev/null | grep -E ":4400|:4300|:4200" | head
echo "== confronto diretto: 4400 dice loggato? =="
curl -s -m 8 "http://127.0.0.1:4400/loginstate" 2>/dev/null | head -c 200; echo
echo "== il backend (localhost) cosa risponde per hdi/loginstate? =="
BPORT=$(ss -ltnp 2>/dev/null | grep -oE '127.0.0.1:[0-9]+' | grep -vE ':44|:43|:42|:41|:45|:46|:47|:48|:49|:50' | head -1 | cut -d: -f2)
echo "porta backend indovinata: ${BPORT:-?}"
[ -n "$BPORT" ] && { echo "--- GET /fonti/hdi/loginstate (senza token) ---"; curl -s -m 8 "http://127.0.0.1:$BPORT/fonti/hdi/loginstate" 2>/dev/null | head -c 300; echo; }
echo "(fine)"
