cd /opt/withus-backend 2>/dev/null || cd /opt/*backend* 2>/dev/null
echo "=== attendo che groupama torni su (pronto) ==="
for i in $(seq 1 20); do
  S=$(curl -s --max-time 6 http://127.0.0.1:4500/status 2>/dev/null)
  ST=$(echo "$S" | sed -n 's/.*"login_step":"\([^"]*\)".*/\1/p')
  echo "  $i: step=$ST"
  [ "$ST" = "pronto" ] || [ "$ST" = "loggato" ] && { echo "$S"; break; }
  sleep 4
done
echo "=== azzero eventuale codice OTP vecchio nello store ==="
curl -s --max-time 8 -X POST http://127.0.0.1:3000/api/fonti/c-groupama/codice -H 'content-type: application/json' -d '{"codice":""}' 2>/dev/null; echo
echo "=== stato finale ==="
curl -s --max-time 6 http://127.0.0.1:4500/status 2>&1; echo
