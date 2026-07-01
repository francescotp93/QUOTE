set +e
sleep 25
sudo systemctl restart hdi-scraper.service 2>&1; echo "rc=$?"
sleep 35
show(){ python3 -c "import sys,json;d=json.load(sys.stdin);print('  ok',d.get('ok'),'premio',d.get('premio_lordo'),'err',(d.get('error') or '')[:80])"; }
echo "== TCM standard (TCM07H.7) capitale 150k dur30 fum mensile — atteso 488,04 =="
curl -s --max-time 120 "http://127.0.0.1:4400/premio-tcm?capitale=150000&durata=30&nascita=17/07/1993&eta=33&fumatore=1&frazcode=8&prodotto=TCM07H.7" | show 2>&1
echo "== TCM MUTUO (TCM20.7) stessi dati — atteso 225,72 =="
curl -s --max-time 120 "http://127.0.0.1:4400/premio-tcm?capitale=150000&durata=30&nascita=17/07/1993&eta=33&fumatore=1&frazcode=8&prodotto=TCM20.7" | show 2>&1
echo "== TCM standard NON fumatore (deve differire) =="
curl -s --max-time 120 "http://127.0.0.1:4400/premio-tcm?capitale=150000&durata=30&nascita=17/07/1993&eta=33&fumatore=0&frazcode=8&prodotto=TCM07H.7" | show 2>&1
echo "---fine---"
