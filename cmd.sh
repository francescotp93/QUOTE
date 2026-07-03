set +e
echo "== servizio =="; systemctl is-active hdi-scraper.service; echo "uptime:"; systemctl show hdi-scraper.service -p ActiveEnterTimestamp --value
echo "== /status =="; timeout 15 curl -s --max-time 12 "http://127.0.0.1:4400/status" 2>&1 | head -c 200; echo ""
echo "== Casa quota (timed, max 130s) =="; T0=$(date +%s); timeout 135 curl -s --max-time 130 "http://127.0.0.1:4400/premio-casa?provincia=TP&tipo=1&mq=2&dimora=1&piano=2&cc=2&eta=5" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  ok',d.get('ok'),'via',d.get('via'),'lordo',d.get('premio_totale'),d.get('error') or '')" 2>&1; echo "  ($(($(date +%s)-T0))s)"
echo "== ultime righe log scraper =="; sudo journalctl -u hdi-scraper.service --since '6 min ago' --no-pager 2>&1 | tail -20
echo "---fine---"
