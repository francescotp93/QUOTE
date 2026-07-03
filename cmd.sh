set +e
echo "== autopull (35s) =="; sleep 35
sudo systemctl restart axa-scraper.service 2>&1; sleep 22
echo "== /premio PRODUZIONE DJ132AK (diretto+fallback) =="; T0=$(date +%s)
timeout 80 curl -s --max-time 75 "http://127.0.0.1:4700/premio?targa=DJ132AK&nascita=17/07/1993" 2>&1 | head -c 500; echo ""; echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
