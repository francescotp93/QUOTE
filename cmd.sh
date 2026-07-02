set +e
echo "== service status =="
systemctl is-active hdi-scraper.service 2>&1
echo "== /status =="
curl -s --max-time 30 "http://127.0.0.1:4400/status" 2>&1 | head -c 400
echo ""
echo "== /login (tentativo) =="
curl -s --max-time 90 "http://127.0.0.1:4400/login" 2>&1 | head -c 400
echo ""
echo "== /status dopo login =="
curl -s --max-time 30 "http://127.0.0.1:4400/status" 2>&1 | head -c 400
echo ""
echo "---fine---"
