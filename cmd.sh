curl -s -m 15 "http://127.0.0.1:4200/pausakeepalive?min=30" >/dev/null 2>&1
curl -s -m 80 "http://127.0.0.1:4200/motor?step=open&wait=14000" >/dev/null 2>&1
curl -s -m 80 "http://127.0.0.1:4200/motor?step=quote&targa=GY263BY&nascita=17/07/1993&calcola=1&wait=16000" >/dev/null 2>&1
echo "=== click RCA -> dump dettaglio ==="
curl -s -m 60 "http://127.0.0.1:4200/motor?step=click&text=RCA&wait=7000" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
for p in d.get('pages',[]):
  for f in p.get('frames',[]):
    if 'offerta' in f['url'] or 'assuntivomotor' in f['url']:
      print('fields:',[{'id':x['id'][:26],'type':x['type'],'ph':x['ph'][:18]} for x in f['fields']][:30])
      print('links:',f.get('links',[])[:40])
      print('TEXT:',f.get('texthead','')[:600])
" 2>/dev/null || echo fail
