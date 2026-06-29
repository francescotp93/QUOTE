echo "=== /login Allianz (user+password+TOTP automatico) ==="
curl -s --max-time 120 -X POST http://127.0.0.1:4200/login 2>/dev/null | head -c 800
echo
echo "=== attendo e rileggo /status ==="
for i in $(seq 1 12); do
  sleep 6
  S=$(curl -s --max-time 6 http://127.0.0.1:4200/status 2>/dev/null)
  echo "[$((i*6))s] $S" | head -c 400; echo
  echo "$S" | grep -q '"loggato": *true' && { echo ">>> LOGGATO ✅"; break; }
done
