curl -s -m 10 "http://127.0.0.1:4200/pausakeepalive?min=45" 2>/dev/null
echo ""
echo "=== reset alla home ==="
curl -s -m 40 "http://127.0.0.1:4200/explore?goto=https://portaleagenzie.allianz.it/matrix/&wait=4000" 2>/dev/null | grep -o '"url": "[^"]*"' | head -1
echo "=== sniffer spento (pronto per Avvia) ==="
curl -s -m 10 "http://127.0.0.1:4200/sniff/stop" >/dev/null 2>&1; echo "ok"
