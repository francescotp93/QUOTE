curl -s -m 10 "http://127.0.0.1:4500/sniff/start" >/dev/null 2>&1
curl -s -m 180 "http://127.0.0.1:4500/premio?targa=GY697XA" 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);print('premio',d.get('premio_annuale_num'))" 2>/dev/null
echo "=== corpi chiave (summary/clauses/quotation) ==="
curl -s -m 30 "http://127.0.0.1:4500/sniff/stop" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin); calls=d.get('calls') or d.get('buf') or (d if isinstance(d,list) else [])
def show(sub):
  for c in calls:
    if sub in c.get('url','') and c.get('kind')=='res' and (c.get('body') or '').strip():
      print('### '+sub+' ('+str(c.get('status'))+')'); print((c.get('body') or '')[:1500]); print(); return
  print('### '+sub+' (no body)')
show('/summary')
show('/clauses')
for c in calls:
  if '/mii/quotation' in c.get('url','') and c.get('kind')=='req' and (c.get('body') or '').strip():
    print('### POST quotation REQ'); print((c.get('body') or '')[:1200]); break
" 2>/dev/null || echo fail
