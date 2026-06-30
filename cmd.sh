echo "=== sniff/stop: riassunto chiamate Motor ==="
curl -s -m 30 "http://127.0.0.1:4200/sniff/stop" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
calls=d.get('calls',[])
print('TOT chiamate:',len(calls))
seen=set()
for c in calls:
  u=c.get('url','')
  # interessano: assuntivomotor app + eventuali API motor/quote, NON la home graphql gia' nota
  if 'assuntivomotor' in u or '/motor' in u or 'fast-quote' in u or 'quotation' in u or 'quote' in u.lower():
    key=(c.get('kind'),c.get('method'),u.split('?')[0])
    if key in seen: continue
    seen.add(key)
    print(c.get('kind'),c.get('method'),c.get('status',''),u[:140])
" 2>/dev/null || echo "(parse fail)"
