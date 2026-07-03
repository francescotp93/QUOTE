set +e
BE=/opt/withus-backend
echo "== autopull (40s) =="; sleep 40
echo "== driver diretto su disco? $(grep -c 'drivePreventivoAXADirect' $BE/scraper/axa/quote-service.mjs) =="
echo "== restart axa-scraper =="; sudo systemctl restart axa-scraper.service 2>&1; echo rc=$?; sleep 25
echo "== AXA /status =="; timeout 30 curl -s --max-time 25 "http://127.0.0.1:4700/status" 2>&1 | head -c 260; echo ""
echo "== /premiodiretto DJ132AK (debug) =="; T0=$(date +%s)
timeout 90 curl -s --max-time 85 "http://127.0.0.1:4700/premiodiretto?targa=DJ132AK&nascita=17/07/1993" 2>&1 | head -c 700; echo ""
echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
