curl -s -m 10 "http://127.0.0.1:4200/pausakeepalive?min=45" 2>/dev/null; echo ""
curl -s -m 8 "http://127.0.0.1:4200/status" 2>/dev/null | head -c 200
