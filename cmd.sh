set +e
echo "== autopull (35s) =="; sleep 35
sudo systemctl restart axa-scraper.service 2>&1; echo rc=$?; sleep 22
echo "== /premiodiretto DJ132AK (dopo fix extension) =="; T0=$(date +%s)
timeout 70 curl -s --max-time 65 "http://127.0.0.1:4700/premiodiretto?targa=DJ132AK&nascita=17/07/1993" 2>&1 | head -c 900; echo ""; echo "  ($(($(date +%s)-T0))s)"
echo "== 2a targa CS228ZE (KIA, dalla cattura) =="; T0=$(date +%s)
timeout 70 curl -s --max-time 65 "http://127.0.0.1:4700/premiodiretto?targa=CS228ZE&nascita=17/07/1993" 2>&1 | head -c 500; echo ""; echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
