set +e
echo "== restart hdi-scraper =="
sudo systemctl restart hdi-scraper.service 2>&1; echo "rc=$?"
sleep 35
BASE="provincia=TP&tipo=1&mq=2&dimora=1&piano=2&cc=2&eta=5"
FULL="081035,081036,081278,081279,081280,081281,081282,081283,081284,091202,131065,135032,131067,131068,181009"
jq_show() { python3 -c "import sys,json;d=json.load(sys.stdin);print('  ok',d.get('ok'),'lordo',d.get('premio_totale'),'netto',d.get('netto_totale_num'),'imposte',d.get('imposte_totale_num'),'err',d.get('error'))"; }
echo "== DEFAULT pacchetto =="
curl -s --max-time 90 "http://127.0.0.1:4400/premio-casa?$BASE&garanzie=$FULL" | jq_show 2>&1
echo "== RC vita massimale 1M (rcmassvita=2) =="
curl -s --max-time 90 "http://127.0.0.1:4400/premio-casa?$BASE&garanzie=$FULL&rcmassvita=2" | jq_show 2>&1
echo "== RC vita + B&B + animali =="
curl -s --max-time 90 "http://127.0.0.1:4400/premio-casa?$BASE&garanzie=$FULL&bnbvita=1&animalivita=1" | jq_show 2>&1
echo "== RC proprieta + B&B (bnbprop=1) =="
curl -s --max-time 90 "http://127.0.0.1:4400/premio-casa?$BASE&garanzie=$FULL&bnbprop=1" | jq_show 2>&1
echo "---fine---"
