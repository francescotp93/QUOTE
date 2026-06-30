echo "=== forzo login HDI (no restart) ==="
curl -s -m 90 "http://127.0.0.1:4400/login" 2>/dev/null; echo ""
echo "=== attendo loggato ==="
for i in $(seq 1 10); do
  s=$(curl -s -m 15 "http://127.0.0.1:4400/status" 2>/dev/null)
  if echo "$s" | grep -q '"loggato":true'; then echo "LOGGATO ($i): $s"; break; fi
  echo "(non ancora, $i)"; sleep 7
done
echo ""
echo "=== casaprobe ==="
curl -s -m 150 "http://127.0.0.1:4400/casaprobe" 2>/dev/null
echo ""
