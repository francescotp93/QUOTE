set +e
BE=/opt/withus-backend
echo "== autopull (40s) =="; sleep 40
echo "== fast-path su disco? =="; grep -c 'FAST PATH' $BE/scraper/hdi/quote-service.mjs 2>&1
echo "== restart hdi-scraper =="; sudo systemctl restart hdi-scraper.service 2>&1; echo "  rc=$?"; sleep 22
echo "== warm-up (fa loggare) =="; curl -s --max-time 60 "http://127.0.0.1:4400/status" >/dev/null 2>&1
echo "== TCM #1 (dopo restart) =="; T0=$(date +%s); curl -s --max-time 140 "http://127.0.0.1:4400/premio-tcm?capitale=100000&durata=30&nascita=17/07/1993&eta=33&fumatore=0&frazcode=1&prodotto=TCM07H.7" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  ok',d.get('ok'),'premio',d.get('premio_lordo'),d.get('error') or '')" 2>&1; echo "  ($(($(date +%s)-T0))s)"
echo "== TCM #2 (caldo) =="; T0=$(date +%s); curl -s --max-time 140 "http://127.0.0.1:4400/premio-tcm?capitale=100000&durata=30&nascita=17/07/1993&eta=33&fumatore=0&frazcode=8&prodotto=TCM07H.7" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  ok',d.get('ok'),'premio',d.get('premio_lordo'))" 2>&1; echo "  ($(($(date +%s)-T0))s)"
echo "== Casa (caldo) =="; T0=$(date +%s); curl -s --max-time 140 "http://127.0.0.1:4400/premio-casa?provincia=TP&tipo=1&mq=2&dimora=1&piano=2&cc=2&eta=5" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  ok',d.get('ok'),'lordo',d.get('premio_totale'))" 2>&1; echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
