set -u
echo "=== stato PRIMA ==="
curl -s --max-time 8 "http://127.0.0.1:4500/loginstate"; echo
echo "=== rilancio login (fresh OTP) ==="
curl -s --max-time 15 "http://127.0.0.1:4500/login"; echo
echo "=== attendo che arrivi allo step OTP ==="
for i in $(seq 1 12); do
  S=$(curl -s --max-time 8 "http://127.0.0.1:4500/loginstate")
  echo "[$i] $S"
  echo "$S" | grep -q "attesa_otp\|loggato\|invio_otp" && break
  sleep 6
done
echo "=== /status finale ==="
curl -s --max-time 8 "http://127.0.0.1:4500/status"; echo
