set +e
echo "== attendo autopull (35s) e verifico che il fix sia sul disco =="
sleep 35
grep -c "LOCK_MAX_MS" /opt/withus-backend/scraper/hdi/quote-service.mjs 2>&1
echo "== restart hdi-scraper (carica il fix) =="
sudo systemctl restart hdi-scraper.service 2>&1; echo "rc=$?"
sleep 38
echo "== Casa + TCM dopo fix =="
T0=$(date +%s); curl -s --max-time 120 "http://127.0.0.1:4400/premio-casa?provincia=TP&tipo=1&mq=2&dimora=1&piano=2&cc=2&eta=5" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  Casa ok',d.get('ok'),'lordo',d.get('premio_totale'))" 2>&1; echo "  ($(($(date +%s)-T0))s)"
T0=$(date +%s); curl -s --max-time 120 "http://127.0.0.1:4400/premio-tcm?capitale=100000&durata=30&nascita=17/07/1993&eta=33&fumatore=0&frazcode=1&prodotto=TCM07H.7" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  TCM ok',d.get('ok'),'premio',d.get('premio_lordo'))" 2>&1; echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
