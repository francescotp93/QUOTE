echo "=== health + raw voltura ==="
echo "--- /health:"; curl -s --max-time 10 "http://127.0.0.1:4300/health" 2>&1 | head -c 200; echo
echo "--- raw /premio (first 600 chars):"
R=$(curl -s --max-time 210 "http://127.0.0.1:4300/premio?targa=GY263BY&situazione=Voltura%20al%20PRA&cf=DDOFNC93L17D423L&indirizzo=$(python3 -c 'import urllib.parse;print(urllib.parse.quote("CONTRADA CASAZZE 142 91025 MARSALA TP"))')" 2>/dev/null)
printf '%s' "$R" | head -c 600; echo
echo "--- parsed:"
printf '%s' "$R" | python3 -c "
import sys,json
try: d=json.load(sys.stdin)
except Exception as e: print('NON JSON',e); sys.exit()
p=d.get('premio') or {}
print('ok:',d.get('ok'),'PREMIO:',p.get('premio_annuale'),'step:',d.get('step'),'error:',d.get('error'))
pd=d.get('prevDump') or {}
print('fns:', json.dumps(pd.get('fns')))
for b in (pd.get('bottoni') or []): print('  btn',json.dumps(b,ensure_ascii=False))
print('premioVis:', pd.get('premioVis'))
for l in (d.get('log') or []): print('  ',str(l)[:160])
" 2>&1 | head -50
