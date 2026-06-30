echo "=== sniff/stop: chiamate assuntivomotor (riassunto) ==="
curl -s -m 30 "http://127.0.0.1:4200/sniff/stop" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
calls=d.get('calls',[])
print('TOT',len(calls))
seen=set()
for c in calls:
  u=c.get('url','')
  if 'assuntivomotor' not in u: continue
  key=(c.get('kind'),c.get('method'),u.split('?')[0].split('/assuntivomotor')[-1])
  if key in seen: continue
  seen.add(key)
  print(c.get('kind'),c.get('method'),c.get('status',''),u.split('/assuntivomotor')[-1][:85])
" 2>/dev/null || echo "(fail)"
