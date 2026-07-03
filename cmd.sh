set +e
echo "== autopull (35s) =="; sleep 35
sudo systemctl restart hdi-scraper.service 2>&1; sleep 22
echo "== /motor-targa DJ132AK (step1 veicolo) =="; T0=$(date +%s)
timeout 60 curl -s --max-time 55 "http://127.0.0.1:4400/motor-targa?targa=DJ132AK&nascita=17/07/1993" 2>&1 | head -c 700; echo ""; echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
