set +e
sudo systemctl restart hdi-scraper.service 2>&1; echo "rc=$?"
sleep 38
echo "== TCM subito dopo restart =="
curl -s --max-time 60 "http://127.0.0.1:4400/premio-tcm?capitale=100000&durata=30&nascita=17/07/1993&eta=33&fumatore=0&frazcode=1&prodotto=TCM07H.7" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  ok',d.get('ok'),'premio',d.get('premio_lordo'))" 2>&1
echo "---fine---"
