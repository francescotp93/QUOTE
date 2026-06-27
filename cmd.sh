echo "=== HOME del portale: menu e link visibili ==="
curl -s --max-time 40 "http://127.0.0.1:4500/explore" 2>&1 | head -120
