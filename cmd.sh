set -u
echo "=== osservo Groupama (invio OTP → loggato) ==="
for i in $(seq 1 12); do
  S=$(curl -s --max-time 6 "http://127.0.0.1:4500/status" 2>/dev/null)
  echo "[$i] $S"
  echo "$S" | grep -q '"loggato":true' && { echo ">>> LOGGATO ✅"; break; }
  echo "$S" | grep -q 'non_loggato\|timeout' && { echo ">>> terminato senza successo"; break; }
  sleep 8
done
echo "=== log ultimi (invio_otp/loggato) ==="
journalctl -u groupama-scraper --no-pager -n 8 2>/dev/null | sed 's/.*\[groupama\]/[groupama]/' | grep -iE "codice|invio|loggato|OTP" | tail -6
