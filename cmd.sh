curl -s -m 10 "http://127.0.0.1:4200/sniff/start" >/dev/null 2>&1
echo "=== type CF in primo campo Inserisci ==="
curl -s -m 70 "http://127.0.0.1:4200/motor?step=type&sel=input%5Bplaceholder%3D%22Inserisci%22%5D&val=DDOFNC93L17D423L&enter=1&wait=8000" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
for p in d.get('pages',[]):
  for f in p.get('frames',[]):
    if 'assuntivomotor' in f['url']:
      print('bodylen',f['bodylen'])
      print('fields:',[ {'id':x['id'],'ph':x['ph']} for x in f['fields']][:20])
      print('links:',f.get('links',[])[:25])
      print('TEXT:',f.get('texthead','')[:700])
" 2>/dev/null || echo "(parse fail)"
