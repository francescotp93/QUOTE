echo "=== navigo alla login Assieasy e leggo URL+titolo (browser vivo end-to-end) ==="
curl -s --max-time 60 "http://127.0.0.1:4800/explore" 2>/dev/null | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    print('url     :', d.get('url'))
    print('title   :', d.get('title'))
    print('frames  :', d.get('frames'))
    fs=d.get('fields') or d.get('inputs') or []
    print('n_campi :', len(fs))
    for f in fs[:12]:
        print('  -', {k:f.get(k) for k in ('name','type','id','lbl','placeholder') if f.get(k)})
except Exception as e:
    print('parse err:', e); print(sys.stdin.read()[:800])
"
