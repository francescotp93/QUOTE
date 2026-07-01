echo "=== status (NO restart) ==="
curl -s -m 20 "http://127.0.0.1:4100/status" 2>/dev/null; echo ""
echo "=== apiprobe CDP a sessione CALDA (no restart) ==="
curl -s -m 160 "http://127.0.0.1:4100/apiprobe" 2>/dev/null
echo ""
