set +e
echo "== scraper attivo =="; systemctl is-active hdi-scraper.service
echo "== /login (come fa il pannello Fonti) =="
curl -s --max-time 90 "http://127.0.0.1:4400/login" 2>&1 | head -c 200
echo ""
echo "== /status =="
curl -s --max-time 20 "http://127.0.0.1:4400/status" 2>&1 | head -c 200
echo ""
echo "---fine---"
