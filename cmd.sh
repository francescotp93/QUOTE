echo "=== Italiana /auto step1 DT803VN: campi del Dati Base + valori ==="
curl -s --max-time 90 "http://127.0.0.1:4300/auto?targa=DT803VN&situazione=Rinnovo" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('url:', d.get('url'))
print('steps:', d.get('steps'))
dump=d.get('dump') or {}
campi=dump.get('campi') or dump.get('controlli') or dump.get('ctrls') or []
print('--- select/input con valore (cerco i vuoti obbligatori) ---')
for c in campi:
    if isinstance(c,dict) and c.get('tag') in ('select','input','SELECT','INPUT'):
        print(' ', c.get('tag'), '| id/name:', c.get('id') or c.get('name'), '| val:', repr(c.get('val') or c.get('value')), '| lbl:', (c.get('lbl') or c.get('label') or '')[:40])
" 2>&1 | head -40
