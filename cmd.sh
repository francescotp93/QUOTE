echo "=== HDI /premio FA85248 (moto rinnovo) — risposta COMPLETA ==="
curl -s --max-time 175 "http://127.0.0.1:4401/premio?targa=FA85248&nascita=17/07/1993" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
for k,v in d.items():
    if k=='log': continue
    print(f'{k}: {str(v)[:200]}')
print('--- LOG ---')
for l in (d.get('log') or []): print('  ', str(l)[:160])
" 2>&1 | head -50
