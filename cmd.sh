echo "=== 24H status (fresh, NO restart) ==="
curl -s -m 20 "http://127.0.0.1:4100/status" 2>/dev/null; echo ""
echo "=== 24H apiprobe (CDP+fastquote) ==="
curl -s -m 175 "http://127.0.0.1:4100/apiprobe" 2>/dev/null | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin)
  print('hasToken:', d.get('hasToken'), 'hdrKeys:', d.get('hdrKeys'))
  s=d.get('steps',{})
  for k in ('search','new','getdetail','setmp'): print(k, s.get(k))
  print('bestGrossPrice:', d.get('bestGrossPrice'),'priceItems:', d.get('priceItems'))
  print('premi:', d.get('premi'))
  print('setmp_raw:', (d.get('setmp_raw') or '')[:180])
except Exception as e: print('parse err', e)
"
echo "---fine---"
