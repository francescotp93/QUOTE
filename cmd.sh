curl -s -m 15 "http://127.0.0.1:4200/pausakeepalive?min=25" >/dev/null 2>&1
echo "=== configura on=rinuncia,forma specifica,rivalsa ==="
curl -s -m 60 "http://127.0.0.1:4200/motor?step=configura&on=rinuncia,forma%20specifica,rivalsa&wait=9000" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('azioni:',d.get('azioni'))
for p in d.get('pages',[]):
  for f in p.get('frames',[]):
    if 'offerta' in f['url']:
      print('links:',f.get('links',[])[:35])
      print('TEXT:',f.get('texthead','')[:500])
" 2>/dev/null || echo fail
