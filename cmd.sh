echo "=== 1) connettivita di rete grezza dal server (curl) ==="
curl -s -o /dev/null -w "http_code=%{http_code} ip=%{remote_ip} time=%{time_total}s\n" --max-time 20 https://withus.assieasy.com/assieasy/ 2>&1 || echo "curl FALLITO"
echo "=== 2) DNS ==="
getent hosts withus.assieasy.com || echo "DNS non risolve"
echo "=== 3) riprovo nav col browser (warm) ==="
curl -s --max-time 25 "http://127.0.0.1:4800/explore?goto=https://withus.assieasy.com/assieasy/" >/dev/null 2>&1
sleep 2
curl -s --max-time 40 "http://127.0.0.1:4800/explore" 2>/dev/null | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin); print('url:',d.get('url'),'| title:',d.get('title'),'| campi:',len(d.get('fields') or d.get('inputs') or []))
except Exception as e: print('err',e, sys.stdin.read()[:300])
"
