curl -s -m 10 "http://127.0.0.1:4500/sniff/start" >/dev/null 2>&1
echo "=== drive preventivo (cattura on) ==="
curl -s -m 180 "http://127.0.0.1:4500/premio?targa=GY697XA" 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);print('premio',d.get('premio_annuale_num'),'ok',d.get('ok'))" 2>/dev/null
echo "=== sniff/stop: chiamate API ISA (riassunto) ==="
curl -s -m 30 "http://127.0.0.1:4500/sniff/stop" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin); calls=d.get('calls') or d.get('buf') or (d if isinstance(d,list) else [])
print('TOT',len(calls))
seen=set()
for c in calls:
  u=c.get('url',''); m=c.get('method','')
  if '/sockjs' in u or u.endswith('.js') or u.endswith('.css'): continue
  key=(m,u.split('?')[0])
  if key in seen: continue
  seen.add(key)
  print(c.get('kind'),m,c.get('status',''),u[:120])
" 2>/dev/null || echo "(parse fail)"
