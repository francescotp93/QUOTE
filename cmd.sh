set -u
echo "=== attendo deploy del fix (autopull) ==="
for i in $(seq 1 12); do
  if grep -q "isAuthsvc" /opt/withus-backend/scraper/groupama/quote-service.mjs 2>/dev/null; then echo "fix deployato ($i)"; break; fi
  echo "  ...($i)"; sleep 12
done
echo "=== attendo lo step OTP (autopull riavvia lo scraper) ==="
for i in $(seq 1 18); do
  S=$(curl -s --max-time 8 "http://127.0.0.1:4500/status" 2>/dev/null)
  [ -n "$S" ] && echo "[$i] $S" || echo "[$i] non ancora su"
  echo "$S" | grep -q "attesa_otp\|loggato" && break
  sleep 8
done
