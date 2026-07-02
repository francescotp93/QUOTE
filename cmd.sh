set +e
echo "== backend ha 150s? =="; grep -o "150000" /opt/withus-backend/server/moto.js | head -1
echo "== restart hdi-scraper (pulisce coda) =="
sudo systemctl restart hdi-scraper.service 2>&1; echo "rc=$?"
sleep 35
echo "== Casa timing dopo restart =="
T0=$(date +%s); curl -s --max-time 150 "http://127.0.0.1:4400/premio-casa?provincia=TP&tipo=1&mq=2&dimora=1&piano=2&cc=2&eta=5" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  ok',d.get('ok'),'lordo',d.get('premio_totale'),'err',(d.get('error') or '')[:60])" 2>&1; echo "  tempo: $(($(date +%s)-T0))s"
echo "== Casa 2a volta (sessione calda) =="
T0=$(date +%s); curl -s --max-time 150 "http://127.0.0.1:4400/premio-casa?provincia=TP&tipo=1&mq=2&dimora=1&piano=2&cc=2&eta=5" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  ok',d.get('ok'),'lordo',d.get('premio_totale'))" 2>&1; echo "  tempo: $(($(date +%s)-T0))s"
echo "---fine---"
