set +e
BE=/opt/withus-backend
echo "== autopull (40s) =="; sleep 40
echo "== casaQuoteNode su disco? =="; grep -c 'casaQuoteNode' $BE/scraper/hdi/quote-service.mjs 2>&1
echo "== restart hdi-scraper =="; sudo systemctl restart hdi-scraper.service 2>&1; echo "  rc=$?"; sleep 22
echo "== Casa #1 (token freddo: harvest via browser, poi diretta) =="
T0=$(date +%s); curl -s --max-time 140 "http://127.0.0.1:4400/premio-casa?provincia=TP&tipo=1&mq=2&dimora=1&piano=2&cc=2&eta=5" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  ok',d.get('ok'),'via',d.get('via'),'lordo',d.get('premio_totale'),d.get('error') or '')" 2>&1; echo "  ($(($(date +%s)-T0))s)"
echo "== Casa #2 (token caldo: diretta pura) =="
T0=$(date +%s); curl -s --max-time 140 "http://127.0.0.1:4400/premio-casa?provincia=TP&tipo=1&mq=2&dimora=1&piano=2&cc=2&eta=5" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  ok',d.get('ok'),'via',d.get('via'),'lordo',d.get('premio_totale'))" 2>&1; echo "  ($(($(date +%s)-T0))s)"
echo "== Casa #3 (con garanzie/RC per confronto premio) =="
T0=$(date +%s); curl -s --max-time 140 "http://127.0.0.1:4400/premio-casa?provincia=TP&tipo=1&mq=2&dimora=1&piano=2&cc=2&eta=5&rcmassvita=3" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  ok',d.get('ok'),'via',d.get('via'),'lordo',d.get('premio_totale'))" 2>&1; echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
