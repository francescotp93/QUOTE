echo "=== status HDI (NO restart) ==="
curl -s -m 20 "http://127.0.0.1:4400/status" 2>/dev/null; echo ""
echo "=== casaprobe (catena init->quotazione) ==="
curl -s -m 150 "http://127.0.0.1:4400/casaprobe" 2>/dev/null
echo ""
