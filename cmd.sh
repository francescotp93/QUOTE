set -u
echo "=== osservo il login Groupama (fino a ~4 min: attendo il tuo OTP) ==="
DONE=""
for i in $(seq 1 24); do
  S=$(curl -s --max-time 8 "http://127.0.0.1:4500/status" 2>/dev/null)
  echo "[$i] $S"
  if echo "$S" | grep -q '"loggato":true'; then echo ">>> LOGGATO ✅"; DONE=1; break; fi
  if echo "$S" | grep -q 'timeout_otp\|non_loggato'; then echo ">>> login terminato senza successo"; DONE=1; break; fi
  sleep 10
done
[ -z "$DONE" ] && echo ">>> ancora in attesa del codice"
