set +e
echo "== restart hdi-scraper =="
sudo systemctl restart hdi-scraper.service 2>&1
echo "restart rc=$?"
echo "== attendo auto-login (35s) =="
sleep 35
echo "== DEFAULT (pacchetto standard) =="
curl -s --max-time 90 "http://127.0.0.1:4400/premio-casa?provincia=TP&tipo=1&mq=2&dimora=1&piano=2&cc=2&eta=5&garanzie=081035,081036,081281,081282,081279,081280,081278,081283,081284,091202,131065,135032,131067,131068,181009" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok',d.get('ok'),'tot',d.get('premio_totale'),'n_gar',len(d.get('garanzie',[])),'err',d.get('error'))" 2>&1
echo "== SOLO RC (131065,135032,131067,131068) =="
curl -s --max-time 90 "http://127.0.0.1:4400/premio-casa?provincia=TP&tipo=1&mq=2&dimora=1&piano=2&cc=2&eta=5&garanzie=131065,135032,131067,131068" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok',d.get('ok'),'tot',d.get('premio_totale'),'n_gar',len(d.get('garanzie',[])),'richieste',d.get('garanzie_richieste'),'err',d.get('error'))" 2>&1
echo "---fine---"
