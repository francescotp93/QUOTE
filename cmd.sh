echo "=== click 'Cambia cliente' ==="
curl -s -m 70 "http://127.0.0.1:4200/motor?step=click&text=Cambia%20cliente&wait=6000" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
for p in d.get('pages',[]):
  for f in p.get('frames',[]):
    if 'assuntivomotor' in f['url'] or f['bodylen']<2000:
      print('--- frame',f['url'][-40:],'bodylen',f['bodylen'])
      print('fields:',[ {'id':x['id'],'ph':x['ph'],'type':x['type']} for x in f['fields']][:20])
      print('links:',f.get('links',[])[:25])
      print('TEXT:',f.get('texthead','')[:600])
" 2>/dev/null || echo "(parse fail)"
