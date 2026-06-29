echo "=== OS / Node ==="; . /etc/os-release 2>/dev/null; echo "$PRETTY_NAME"; node -v 2>/dev/null; npm -v 2>/dev/null; echo "host=$(hostname)"
echo "=== servizi systemd withus/scraper ==="; systemctl list-units --type=service --all --no-pager 2>/dev/null | grep -iE "withus|scraper|cmd-runner" | awk '{print $1,$4}'
echo "=== timers ==="; systemctl list-timers --all --no-pager 2>/dev/null | grep -iE "autopull|cmd-runner|withus" | awk '{print $NF}'
echo "=== FONTI_SECRET impostato? (NON stampo il valore) ==="; systemctl show withus-backend -p Environment 2>/dev/null | grep -o "FONTI_SECRET=." >/dev/null && echo "SI (in unit)" || echo "no in unit"; [ -f /opt/withus-backend/server/.env ] && grep -q FONTI_SECRET /opt/withus-backend/server/.env && echo ".env: SI" || echo ".env: no/assente"
echo "=== token github presente? ==="; [ -f /root/.withus-gh-token ] && echo "SI ($(wc -c </root/.withus-gh-token) byte)" || echo "NO"
echo "=== fonti.store.json ==="; ls -l /opt/withus-backend/server/fonti.store.json 2>/dev/null | awk '{print $5" byte"}'
echo "=== unit: withus-backend ==="; cat /etc/systemd/system/withus-backend.service 2>/dev/null
echo "=== unit: un scraper (axa) ==="; cat /etc/systemd/system/axa-scraper.service 2>/dev/null
echo "=== start-service.sh (axa) ==="; sed -n '1,60p' /opt/withus-backend/scraper/axa/start-service.sh 2>/dev/null || sed -n '1,60p' /opt/withus-backend/scraper/_template/start-service.sh 2>/dev/null
