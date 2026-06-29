echo "=== ricarico access.hdia.it/uefa/ piu' volte e guardo se 'Access Denied' sparisce ==="
for i in 1 2 3 4 5; do
  curl -s --max-time 35 "http://127.0.0.1:4400/explore?goto=https://access.hdia.it/uefa/" >/dev/null 2>&1
  sleep 7
  T=$(curl -s --max-time 12 http://127.0.0.1:4400/logindump 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);print((d.get('title','')+'|'+d.get('text','')).replace(chr(10),' ')[:70])" 2>/dev/null)
  echo "  giro $i: $T"
done
