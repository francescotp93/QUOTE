set +e
echo "== AXA /status =="; timeout 30 curl -s --max-time 25 "http://127.0.0.1:4700/status" 2>&1 | head -c 200; echo ""
echo "== /premiodiretto DJ132AK (debug) =="; T0=$(date +%s)
timeout 90 curl -s --max-time 85 "http://127.0.0.1:4700/premiodiretto?targa=DJ132AK&nascita=17/07/1993" 2>&1 | head -c 900; echo ""
echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
