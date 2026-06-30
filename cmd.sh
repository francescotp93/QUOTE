echo "=== VOLTURA GY263BY: trigger calcolo + prevDump ==="
R=$(curl -s --max-time 200 "http://127.0.0.1:4300/premio?targa=GY263BY&situazione=Voltura%20al%20PRA&cf=DDOFNC93L17D423L&indirizzo=$(python3 -c 'import urllib.parse;print(urllib.parse.quote("CONTRADA CASAZZE 142 91025 MARSALA TP"))')" 2>/dev/null)
printf '%s' "$R" | python3 -c "
import sys,json
try: d=json.load(sys.stdin)
except: print('NON JSON:'); print(sys.stdin.read()[:400]); sys.exit()
p=d.get('premio') or {}
print('ok:',d.get('ok'),'PREMIO:',p.get('premio_annuale'),'step:',d.get('step'))
pd=d.get('prevDump') or {}
print('--- prevDump.fns:', json.dumps(pd.get('fns')))
print('--- prevDump.bottoni:')
for b in (pd.get('bottoni') or []): print('     ', json.dumps(b,ensure_ascii=False))
print('--- prevDump.premioVis:', pd.get('premioVis'))
print('=== LOG ===')
for l in (d.get('log') or []): print('  ',str(l)[:160])
" 2>&1 | head -50
