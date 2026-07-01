echo "=== status moto/24h (NO restart) ==="
curl -s -m 20 "http://127.0.0.1:4100/status" 2>/dev/null; echo ""
echo "=== apiprobe (no restart) ==="
curl -s -m 150 "http://127.0.0.1:4100/apiprobe" 2>/dev/null
echo ""
