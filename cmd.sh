set +e
BASE="provincia=TP&tipo=1&mq=2&dimora=1&piano=2&cc=2&eta=5"
sh(){ curl -s --max-time 90 "http://127.0.0.1:4400/premio-casa?$1" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  lordo',d.get('premio_totale'),'ok',d.get('ok'))" 2>&1; }
echo "== sola RC proprieta, valfab 250k =="; sh "$BASE&garanzie=131067,131068,181009&valfabbricato=250000"
echo "== sola RC proprieta, valfab 500k =="; sh "$BASE&garanzie=131067,131068,181009&valfabbricato=500000"
echo "== sola RC (vita+prop), valcont 50k =="; sh "$BASE&garanzie=131065,135032,131067,131068,181009&valcontenuto=50000"
echo "== sola RC (vita+prop), valcont 100k =="; sh "$BASE&garanzie=131065,135032,131067,131068,181009&valcontenuto=100000"
echo "== full pacchetto default (atteso ~575,77) =="; sh "$BASE&garanzie=081035,081036,081278,081279,081280,081281,081282,081283,081284,091202,131065,135032,131067,131068,181009"
echo "---fine---"
