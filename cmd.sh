echo "=== VOLTURA GY263BY: prevDump completo ==="
R=$(curl -s --max-time 210 "http://127.0.0.1:4300/premio?targa=GY263BY&situazione=Voltura%20al%20PRA&cf=DDOFNC93L17D423L&indirizzo=$(python3 -c 'import urllib.parse;print(urllib.parse.quote("CONTRADA CASAZZE 142 91025 MARSALA TP"))')" 2>/dev/null)
printf '%s' "$R" | python3 -c "
import sys,json
try: d=json.load(sys.stdin)
except Exception as e: print('NON JSON',e); print(sys.stdin.read()[:300]); sys.exit()
p=d.get('premio') or {}
print('ok:',d.get('ok'),'PREMIO:',p.get('premio_annuale'),'step:',d.get('step'))
pd=d.get('prevDump')
if pd is None: print('!! prevDump ASSENTE (codice vecchio)')
else:
  print('fns:', json.dumps(pd.get('fns')))
  print('arr:', json.dumps(pd.get('arr')))
  print('heading:', pd.get('heading'))
  print('popup:', pd.get('popup'))
  print('premioVis:', pd.get('premioVis'))
  print('bottoni:')
  for b in (pd.get('bottoni') or []): print('   ', json.dumps(b,ensure_ascii=False))
print('=== LOG ===')
for l in (d.get('log') or []): print('  ',str(l)[:170])
" 2>&1 | head -55
