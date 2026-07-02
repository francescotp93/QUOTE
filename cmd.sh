set +e
echo "== /status =="; curl -s --max-time 20 "http://127.0.0.1:4400/status" | head -c 160; echo ""
echo "== Casa (timing) =="
T0=$(date +%s); curl -s --max-time 100 "http://127.0.0.1:4400/premio-casa?provincia=TP&tipo=1&mq=2&dimora=1&piano=2&cc=2&eta=5" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  ok',d.get('ok'),'lordo',d.get('premio_totale'),'err',(d.get('error') or '')[:60])" 2>&1; echo "  tempo Casa: $(($(date +%s)-T0))s"
echo "== TCM (timing) =="
T0=$(date +%s); curl -s --max-time 120 "http://127.0.0.1:4400/premio-tcm?capitale=100000&durata=10&nascita=17/07/1993&eta=33&fumatore=0&frazcode=1&prodotto=TCM07H.7" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  ok',d.get('ok'),'premio',d.get('premio_lordo'))" 2>&1; echo "  tempo TCM: $(($(date +%s)-T0))s"
echo "---fine---"
