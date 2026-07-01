set +e
echo "== restart hdi-scraper =="
sudo systemctl restart hdi-scraper.service 2>&1; echo "rc=$?"
sleep 35
BASE="provincia=TP&tipo=1&mq=2&dimora=1&piano=2&cc=2&eta=5"
echo "== DEFAULT (fabbr 250k / cont 50k) =="
curl -s --max-time 90 "http://127.0.0.1:4400/premio-casa?$BASE" | python3 -c "import sys,json;d=json.load(sys.stdin);print('ok',d.get('ok'),'tot',d.get('premio_totale'),'err',d.get('error'))" 2>&1
echo "== FABBRICATO 400k / CONTENUTO 100k =="
curl -s --max-time 90 "http://127.0.0.1:4400/premio-casa?$BASE&valfabbricato=400000&valcontenuto=100000" | python3 -c "import sys,json;d=json.load(sys.stdin);print('ok',d.get('ok'),'tot',d.get('premio_totale'),'err',d.get('error'))" 2>&1
echo "== FABBRICATO 150k / CONTENUTO 20k =="
curl -s --max-time 90 "http://127.0.0.1:4400/premio-casa?$BASE&valfabbricato=150000&valcontenuto=20000" | python3 -c "import sys,json;d=json.load(sys.stdin);print('ok',d.get('ok'),'tot',d.get('premio_totale'),'err',d.get('error'))" 2>&1
echo "---fine---"
