echo "=== seguo il login Prima gia in corso per ~90s (no re-trigger) ==="
for i in $(seq 1 15); do
  S=$(curl -s --max-time 6 http://127.0.0.1:4600/loginstate 2>/dev/null)
  echo "[$((i*6))s] $S" | head -c 220; echo
  echo "$S" | grep -qE '"step": *"(attesa_otp|loggato|error|pronto)"' && break
  sleep 6
done
echo "=== url corrente del browser prima ==="
curl -s --max-time 8 http://127.0.0.1:4600/status 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);print('url:',d.get('url'),'| loggato:',d.get('loggato'),'| step:',d.get('login_step'))" 2>&1 | head -2
