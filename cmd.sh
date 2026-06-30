echo "=== attendo che HDI /status risponda ==="
for i in $(seq 1 12); do
  s=$(curl -s -m 15 "http://127.0.0.1:4400/status" 2>/dev/null)
  if echo "$s" | grep -q '"loggato"'; then echo "pronto dopo ${i} tentativi: $s"; break; fi
  echo "(non pronto, tentativo $i)"; sleep 6
done
echo ""
echo "=== casaprobe (raw) ==="
curl -s -m 150 "http://127.0.0.1:4400/casaprobe" 2>/dev/null
echo ""
echo "=== fine ==="
