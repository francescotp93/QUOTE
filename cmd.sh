echo "=== 24H /quote FA85248 — prezzi con contesto + pageText completo ==="
curl -s --max-time 230 "http://127.0.0.1:4100/quote?targa=FA85248&nascita=17/07/1993&cf=DDOFNC93L17D423L&comune=Marsala" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('url:', d.get('url'))
print('=== prezziConContesto (tutti) ===')
for p in (d.get('prezziConContesto') or []): print(' ', repr(p.get('prezzo')), '<-', repr((p.get('ctx') or '')[:70]))
print('=== prezzi distinti ===', d.get('prezzi'))
print('=== pageText ===')
print((d.get('pageText') or '')[:1400])
"
