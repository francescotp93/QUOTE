echo "=== type targa in #nx-input-0 ==="
curl -s -m 60 "http://127.0.0.1:4200/motor?step=type&sel=%23nx-input-0&val=GY263BY&wait=6000" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('target',d.get('target'))
for p in d.get('pages',[]):
  for f in p.get('frames',[]):
    if 'assuntivomotor' in f['url'] or f['bodylen']<1500:
      print('--- frame',f['url'][:90],'bodylen',f['bodylen'])
      print('  fields:',[ {'id':x['id'],'ph':x['ph'],'type':x['type']} for x in f['fields']][:25])
      print('  links:',f.get('links',[])[:30])
      print('  texthead:',f.get('texthead','')[:400])
" 2>/dev/null || echo "(parse fail)"
