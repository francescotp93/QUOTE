echo "--- click Infortuni ---"
curl -s -m 60 "http://127.0.0.1:4200/motor?step=click&text=Infortuni&wait=7000" 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);print('target',d.get('target'))" 2>/dev/null
echo "--- sniff/stop: PUT/POST scrittura ---"
curl -s -m 30 "http://127.0.0.1:4200/sniff/stop" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin); calls=d.get('calls',[])
print('TOT',len(calls))
for c in calls:
  m=c.get('method',''); u=c.get('url','')
  if m in ('PUT','POST','PATCH') and 'assuntivomotor' in u:
    print(c.get('kind'),m,c.get('status',''),u.split('/assuntivomotor')[-1][:90])
    if c.get('body'): print('   body:',c['body'][:300])
" 2>/dev/null || echo fail
