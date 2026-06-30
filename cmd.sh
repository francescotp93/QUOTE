curl -s -m 15 "http://127.0.0.1:4200/pausakeepalive?min=30" >/dev/null 2>&1
echo "=== /motor step=open ==="
curl -s -m 90 "http://127.0.0.1:4200/motor?step=open&sniff=1&wait=16000" 2>/dev/null | head -c 7500
