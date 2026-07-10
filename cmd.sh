set +e
echo "=== /status ==="
curl -s --max-time 8 http://127.0.0.1:4200/status; echo
echo "=== /motor?step=probe (no click, veloce) ==="
timeout 70 curl -s --max-time 65 "http://127.0.0.1:4200/motor?step=probe&wait=1500" > /tmp/alzprobe.json 2>&1
echo "dim: $(wc -c < /tmp/alzprobe.json) byte"
head -c 2500 /tmp/alzprobe.json
echo
echo "---fine---"
