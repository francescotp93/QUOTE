curl -s -m 150 "http://127.0.0.1:4400/casaprobe" 2>/dev/null | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin)
  print('hasToken:', d.get('hasToken'))
  print('prodotti.status:', (d.get('prodotti') or {}).get('status'))
  ci=d.get('casaInit') or {}
  print('casaInit.status:', ci.get('status'), 'len:', ci.get('len'), 'topKeys:', ci.get('topKeys'))
  cq=d.get('casaQuot') or {}
  print('casaQuot:', {k:cq.get(k) for k in ('status','len','premioTrovato')})
except Exception as e:
  print('parse err', e)
"
echo "---fine---"
