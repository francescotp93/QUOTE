set +e
echo "== TCM verifica (atteso 488,04) =="
curl -s --max-time 120 "http://127.0.0.1:4400/premio-tcm?capitale=150000&durata=30&nascita=17/07/1993&eta=33&fumatore=1&frazcode=8&prodotto=TCM07H.7" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  ok',d.get('ok'),'premio',d.get('premio_lordo'),'err',(d.get('error') or '')[:70])" 2>&1
echo "== Casa verifica (atteso ~575,77) =="
curl -s --max-time 90 "http://127.0.0.1:4400/premio-casa?provincia=TP&tipo=1&mq=2&dimora=1&piano=2&cc=2&eta=5" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  ok',d.get('ok'),'lordo',d.get('premio_totale'),'err',(d.get('error') or '')[:70])" 2>&1
echo "---fine---"
