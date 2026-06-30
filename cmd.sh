echo "=== cerco chiamate anagrafiche/ricerca nel buffer ==="
curl -s -m 30 "http://127.0.0.1:4200/sniff/stop" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
calls=d.get('calls',[])
print('TOT',len(calls))
for c in calls:
  u=c.get('url','')
  b=c.get('body','') or ''
  if 'anagrafiche' in u or 'ricerca' in u.lower() or 'DDOFNC' in b or 'soggett' in u.lower() or 'cliente' in u.lower():
    print('>>',c.get('kind'),c.get('method'),c.get('status',''),u.split('/assuntivomotor')[-1][:90])
    if c.get('kind')=='res' and b: print('   RES:',b[:600])
    if c.get('kind')=='req' and b: print('   REQ:',b[:300])
" 2>/dev/null || echo "(parse fail)"
