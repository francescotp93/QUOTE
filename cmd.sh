echo "=== ITALIANA /status (porta 4300) ==="
curl -s --max-time 12 http://127.0.0.1:4300/status 2>&1; echo
echo "=== ITALIANA: dove si trova la pagina ==="
curl -s --max-time 35 "http://127.0.0.1:4300/explore" 2>&1 | grep -iE "\"url\"|\"text\"" | head -2 | cut -c1-220
echo "=== GROUPAMA /status ==="
curl -s --max-time 12 http://127.0.0.1:4500/status 2>&1; echo
