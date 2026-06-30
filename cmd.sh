echo "=== backend vivo dopo il deploy di fonti.js? ==="
sleep 75
for i in $(seq 1 8); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "http://127.0.0.1:8080/health" 2>/dev/null)
  [ -z "$code" -o "$code" = "000" ] && code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "http://127.0.0.1:3000/health" 2>/dev/null)
  echo "tentativo $i: backend /health = ${code:-DOWN}"
  [ "$code" = "200" ] && break
  sleep 6
done
echo "--- porta in ascolto del backend:"
ss -ltnp 2>/dev/null | grep -E ":(8080|3000|3001|8000)" | head
