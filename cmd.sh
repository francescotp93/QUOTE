curl -s -m 15 "http://127.0.0.1:4200/pausakeepalive?min=30" >/dev/null 2>&1
curl -s -m 15 "http://127.0.0.1:4200/sniff/start" >/dev/null 2>&1
echo "--- open ---"; curl -s -m 80 "http://127.0.0.1:4200/motor?step=open&wait=15000" 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);print('open ok' if any('assuntivomotor' in f['url'] for p in d.get('pages',[]) for f in p.get('frames',[])) else 'NO')" 2>/dev/null
echo "--- quote+calcola -> offerta ---"; curl -s -m 80 "http://127.0.0.1:4200/motor?step=quote&targa=GY263BY&nascita=17/07/1993&calcola=1&wait=18000" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
for p in d.get('pages',[]):
  for f in p.get('frames',[]):
    if 'offerta' in f['url']:
      print('OFFERTA bodylen',f['bodylen'])
      print('links:',f.get('links',[])[:40])
      print('fields:',[{'id':x['id'][:24],'type':x['type']} for x in f['fields']][:25])
" 2>/dev/null || echo fail
