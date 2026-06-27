set -u
echo "=== attendo redeploy (input nativo) ==="
for i in $(seq 1 14); do
  if grep -q "input NATIVO" /opt/withus-backend/scraper/prima/quote-service.mjs 2>/dev/null && grep -q "input NATIVO" /opt/withus-backend/scraper/groupama/quote-service.mjs 2>/dev/null; then echo "deployato ($i)"; break; fi
  echo "  ...($i)"; sleep 12
done
sleep 6
echo "=== avvio login ==="
curl -s --max-time 12 "http://127.0.0.1:4500/login" >/dev/null 2>&1
curl -s --max-time 12 "http://127.0.0.1:4600/login" >/dev/null 2>&1
echo "=== osservo (atteso: attesa_otp e RESTA) ==="
for i in $(seq 1 12); do
  G=$(curl -s --max-time 6 "http://127.0.0.1:4500/status" 2>/dev/null | sed 's/.*login_step":"\([^"]*\)".*/\1/')
  P=$(curl -s --max-time 6 "http://127.0.0.1:4600/status" 2>/dev/null | sed 's/.*login_step":"\([^"]*\)".*/\1/')
  echo "[$i] GROUPAMA=$G | PRIMA=$P"
  sleep 9
done
echo "=== finale ==="; curl -s --max-time 8 "http://127.0.0.1:4500/status"; echo; curl -s --max-time 8 "http://127.0.0.1:4600/status"; echo
