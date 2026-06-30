echo "=== ALLIANZ ANIA: lookup targa GY263BY (struttura risultato) ==="
R=$(curl -s --max-time 70 "http://127.0.0.1:4200/lookup?targa=GY263BY" 2>/dev/null)
printf '%s' "$R" | python3 -c "
import sys,json
try: d=json.load(sys.stdin)
except Exception as e: print('NON JSON',e); print(sys.stdin.read()[:400]); sys.exit()
print('ok:',d.get('ok'),'campo_targa_compilato:',d.get('campo_targa_compilato'))
dump=d.get('_dump') or {}
print('url:',dump.get('url'),'| title:',dump.get('title'))
print('=== TESTO RISULTATO (3000c) ===')
print(dump.get('text') or '(vuoto)')
print('=== CONTROLLI (tabelle/campi) ===')
for c in (dump.get('ctrls') or []):
  if c.get('tag') in ('table','input','select') or (c.get('text') and len(c.get('text'))>2):
    print('  ',c.get('tag'),c.get('id') or c.get('name') or '',':',(c.get('text') or '')[:60])
" 2>&1 | head -80
