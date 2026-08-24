#!/usr/bin/env bash
# Verifica (sola lettura) che la correzione HDI sia stata applicata dall'autopull.
set -u
echo "== marcatore setup.d =="
ls -1 /var/lib/withus-autopull/ 2>/dev/null | grep -i hdi
echo "log: $(tail -3 /var/lib/withus-autopull/60-hdi-scraper-porta-4400.sh.log 2>/dev/null)"
echo "== porta HDI nell'ambiente del backend ORA =="
PID=$(systemctl show withus-backend -p MainPID --value 2>/dev/null)
echo "PID=$PID attivo=$(systemctl is-active withus-backend 2>/dev/null)"
tr '\0' '\n' < "/proc/$PID/environ" 2>/dev/null | grep '^HDI_SCRAPER_URL='
echo "== scraper HDI su 4400 =="
curl -s -m 8 "http://127.0.0.1:4400/loginstate" 2>/dev/null | grep -oE '"step":"[^"]*"'
echo "== backend up su :3000 =="; ss -ltnp 2>/dev/null | grep -c ':3000'
echo "(fine)"
