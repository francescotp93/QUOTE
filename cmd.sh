set +e
echo "== autopull (35s) =="; sleep 35
sudo systemctl restart hdi-scraper.service 2>&1; sleep 22
echo "== /premio-motor GY263BY (MAZDA, debug) =="; T0=$(date +%s)
timeout 90 curl -s --max-time 85 "http://127.0.0.1:4400/premio-motor?targa=GY263BY&nascita=17/07/1993&debug=1" 2>&1 | head -c 900; echo ""; echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
