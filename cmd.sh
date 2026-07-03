set +e
BE=/opt/withus-backend
echo "== autopull (40s) =="; sleep 40
echo "== lock-free su disco? $(grep -c 'Casa diretta è pura HTTP' $BE/scraper/hdi/quote-service.mjs) =="
echo "== restart scraper =="; sudo systemctl restart hdi-scraper.service 2>&1; sleep 22
echo "== Casa #1 (freddo: refresh token col lock) =="; T0=$(date +%s); curl -s --max-time 130 "http://127.0.0.1:4400/premio-casa?provincia=TP&tipo=1&mq=2&dimora=1&piano=2&cc=2&eta=5" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  ok',d.get('ok'),'via',d.get('via'),'lordo',d.get('premio_totale'))" 2>&1; echo "  ($(($(date +%s)-T0))s)"
echo "== Casa x3 in PARALLELO (lock-free: devono uscire tutte ~insieme) =="
T0=$(date +%s)
for i in 1 2 3; do curl -s --max-time 60 "http://127.0.0.1:4400/premio-casa?provincia=TP&tipo=1&mq=2&dimora=1&piano=2&cc=2&eta=5&rcmassvita=$i" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  ok',d.get('ok'),'via',d.get('via'),'lordo',d.get('premio_totale'))" 2>&1 & done
wait; echo "  totale parallelo ($(($(date +%s)-T0))s)"
echo "== TCM ancora ok (usa il lock) =="; T0=$(date +%s); curl -s --max-time 130 "http://127.0.0.1:4400/premio-tcm?capitale=100000&durata=30&nascita=17/07/1993&eta=33&fumatore=0&frazcode=1&prodotto=TCM07H.7" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  ok',d.get('ok'),'premio',d.get('premio_lordo'))" 2>&1; echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
