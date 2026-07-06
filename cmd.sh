
set +e
echo "== HDI /status =="
timeout 12 curl -s --max-time 10 "http://127.0.0.1:4400/status" 2>&1 | head -c 500; echo ""
echo "== HDI /loginstate (se esiste) =="
timeout 12 curl -s --max-time 10 "http://127.0.0.1:4400/loginstate" 2>&1 | head -c 400; echo ""
echo "== log recenti hdi (dove si blocca) =="
sudo journalctl -u hdi-scraper.service -n 40 --no-pager 2>/dev/null | tail -40
echo "---fine---"
