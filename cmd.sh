echo "=== VOLTURA GY263BY: LOG COMPLETO al Preventivo ==="
R=$(curl -s --max-time 175 "http://127.0.0.1:4300/premio?targa=GY263BY&situazione=Voltura%20al%20PRA&cf=DDOFNC93L17D423L&indirizzo=$(python3 -c 'import urllib.parse;print(urllib.parse.quote("CONTRADA CASAZZE 142 91025 MARSALA TP"))')" 2>/dev/null)
printf '%s' "$R" | python3 -c "
import sys,json
try: d=json.load(sys.stdin)
except: print('NON JSON'); sys.exit()
p=d.get('premio') or {}
print('ok:',d.get('ok'),'PREMIO:',p.get('premio_annuale'),'step:',d.get('step'))
print('campi vuoti:', [(c.get('id') or c.get('name')) for c in (d.get('campiVuoti') or [])][:8])
print('=== LOG COMPLETO ===')
for l in (d.get('log') or []): print('  ',str(l)[:150])
" 2>&1 | head -40
