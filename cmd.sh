echo "=== status HDI (NO restart) ==="
s=$(curl -s -m 15 "http://127.0.0.1:4400/status" 2>/dev/null); echo "$s"
if echo "$s" | grep -q '"loggato":true'; then
  echo "=== sessione viva → casaprobe catena ==="
  curl -s -m 160 "http://127.0.0.1:4400/casaprobe" 2>/dev/null
else
  echo "=== non loggato: provo /login UNA volta (no restart) e riattendo ==="
  curl -s -m 90 "http://127.0.0.1:4400/login" >/dev/null 2>&1
  for i in $(seq 1 8); do s=$(curl -s -m 15 "http://127.0.0.1:4400/status" 2>/dev/null); echo "$s" | grep -q '"loggato":true' && { echo "LOGGATO ($i)"; break; }; echo "(attendo $i)"; sleep 8; done
  echo "--- casaprobe ---"
  curl -s -m 160 "http://127.0.0.1:4400/casaprobe" 2>/dev/null
fi
echo ""
