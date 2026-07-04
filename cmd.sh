set +e
echo "== AXA status =="; timeout 6 curl -s --max-time 5 "http://127.0.0.1:4700/status" 2>/dev/null | head -c 300; echo ""
echo "== AXA loginstate =="; timeout 6 curl -s --max-time 5 "http://127.0.0.1:4700/loginstate" 2>/dev/null | head -c 200; echo ""
echo "---fine---"
