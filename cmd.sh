echo "=== cerca_anagrafica per il CF del nuovo intestatario (LAUDICINA) ==="
curl -s --max-time 40 "http://127.0.0.1:4300/api?action=cerca_anagrafica&cf_piva=LDCDNL90A59D423L&filtro=1" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
r=d.get('risposta')
print('risposta (primi 1200 char):')
print(json.dumps(r, ensure_ascii=False, indent=1)[:1200] if r else repr(r))
" 2>&1 | head -40
