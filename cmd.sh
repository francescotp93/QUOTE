echo "=== ALLIANZ ANIA: testo COMPLETO dopo ricerca GY263BY ==="
R=$(curl -s --max-time 70 "http://127.0.0.1:4200/lookup?targa=GY263BY" 2>/dev/null)
printf '%s' "$R" | python3 -c "
import sys,json
try: d=json.load(sys.stdin)
except Exception as e: print('NON JSON',e); sys.exit()
dump=d.get('_dump') or {}
print('url:',dump.get('url'))
print('=== TESTO COMPLETO ===')
print(dump.get('text') or '(vuoto)')
print('=== TABELLE / SELECT / pulsanti ===')
for c in (dump.get('ctrls') or []):
  if c.get('tag') in ('table','select') or (c.get('type') in ('submit','radio','checkbox')) or (c.get('text') and len(c.get('text'))>3 and c.get('tag')!='input'):
    print('  ',c.get('tag'),'|',c.get('id') or c.get('name'),'|',(c.get('text') or '')[:70])
" 2>&1 | head -70
