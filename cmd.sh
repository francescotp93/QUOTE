set +e
echo "== attendo autopull (40s) =="
sleep 40
BE=/opt/withus-backend
echo "== fix su disco? =="
echo "  watchdog scraper:  $(grep -c 'WATCHDOG_MS' $BE/scraper/hdi/quote-service.mjs 2>&1)"
echo "  retry verifica be: $(grep -c 'riscaldata dal primo tentativo' $BE/server/fonti.js 2>&1)"
echo "== scopro servizio backend (porta 3000) =="
BSVC=$(systemctl list-units --type=service --state=running --no-legend 2>/dev/null | grep -iE 'withus|backend|node|pay|api' | awk '{print $1}' | head -1)
echo "  backend svc = ${BSVC:-'(non trovato)'}"
echo "== restart hdi-scraper =="
sudo systemctl restart hdi-scraper.service 2>&1; echo "  rc=$?"
if [ -n "$BSVC" ]; then echo "== restart backend ($BSVC) =="; sudo systemctl restart "$BSVC" 2>&1; echo "  rc=$?"; fi
echo "== attendo avvio (40s) =="
sleep 40
echo "== /status =="; timeout 12 curl -s --max-time 10 "http://127.0.0.1:4400/status" 2>&1 | head -c 200; echo ""
echo "== /login =="; timeout 95 curl -s --max-time 90 "http://127.0.0.1:4400/login" 2>&1 | head -c 200; echo ""
echo "== Casa =="; T0=$(date +%s); curl -s --max-time 120 "http://127.0.0.1:4400/premio-casa?provincia=TP&tipo=1&mq=2&dimora=1&piano=2&cc=2&eta=5" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  ok',d.get('ok'),'lordo',d.get('premio_totale'))" 2>&1; echo "  ($(($(date +%s)-T0))s)"
echo "== TCM =="; T0=$(date +%s); curl -s --max-time 120 "http://127.0.0.1:4400/premio-tcm?capitale=100000&durata=30&nascita=17/07/1993&eta=33&fumatore=0&frazcode=1&prodotto=TCM07H.7" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  ok',d.get('ok'),'premio',d.get('premio_lordo'))" 2>&1; echo "  ($(($(date +%s)-T0))s)"
echo "== watchdog nei log? =="; sudo journalctl -u hdi-scraper.service --since '2 min ago' --no-pager 2>&1 | grep -iE 'watchdog|Telecomando' | tail -3
echo "---fine---"
