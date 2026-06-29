echo "=== status ==="
curl -s --max-time 8 "http://127.0.0.1:4200/status" 2>/dev/null; echo
echo "=== ANIA lookup targa GY263BY (verifica sessione reale) ==="
curl -s --max-time 60 "http://127.0.0.1:4200/lookup?targa=GY263BY" 2>/dev/null | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    print('ok:', d.get('ok'),'| url:', (d.get('url') or '')[:90])
    dump=d.get('dump') or d.get('text') or ''
    print('estratto:', (dump if isinstance(dump,str) else json.dumps(dump))[:500].replace(chr(10),' '))
except Exception as e: print('parse err',e); print(sys.stdin.read()[:600])
"
echo "=== mappo il portale /matrix/ (voci di menu per il PREVENTIVO auto) ==="
curl -s --max-time 40 "http://127.0.0.1:4200/logindump" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('url:', (d.get('url') or '')[:90], '| title:', d.get('title'))
for c in (d.get('ctrls') or [])[:30]:
    t=(c.get('text') or '')
    if t: print('  ', c.get('tag'), '|', t[:50], '|', c.get('id') or c.get('name') or '')
"
