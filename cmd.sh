set +e
BE=/opt/withus-backend
echo "== autopull (35s) =="; sleep 35
sudo systemctl restart axa-scraper.service 2>&1; echo rc=$?; sleep 22
echo "== /premiodiretto DJ132AK (ISOLATO, debug) =="; T0=$(date +%s)
timeout 60 curl -s --max-time 55 "http://127.0.0.1:4700/premiodiretto?targa=DJ132AK&nascita=17/07/1993" 2>&1 | head -c 1200; echo ""
echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
