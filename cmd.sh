echo "=== step=quote (targa+nascita+CALCOLA) ==="
curl -s -m 90 "http://127.0.0.1:4200/motor?step=quote&targa=GY263BY&nascita=15/05/1985&calcola=1&wait=18000" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('target',d.get('target'))
for p in d.get('pages',[]):
  for f in p.get('frames',[]):
    if 'assuntivomotor' in f['url']:
      print('--- iframe bodylen',f['bodylen'])
      print('  fields:',[ {'id':x['id'],'ph':x['ph']} for x in f['fields']][:25])
      print('  links:',f.get('links',[])[:30])
      print('  TEXT:',f.get('texthead','')[:600])
" 2>/dev/null || echo "(parse fail)"
