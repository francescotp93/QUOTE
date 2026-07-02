set +e
echo "== servizio =="; systemctl is-active hdi-scraper.service
echo "== /status =="; timeout 12 curl -s --max-time 10 "http://127.0.0.1:4400/status" 2>&1 | head -c 250; echo ""
echo "== /login =="; timeout 95 curl -s --max-time 90 "http://127.0.0.1:4400/login" 2>&1 | head -c 250; echo ""
echo "== /status dopo login =="; timeout 12 curl -s --max-time 10 "http://127.0.0.1:4400/status" 2>&1 | head -c 250; echo ""
echo "---fine---"
