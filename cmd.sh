echo "=== VOLTURA GY263BY: quotazione[0] dump ==="
R=$(curl -s --max-time 210 "http://127.0.0.1:4300/premio?targa=GY263BY&situazione=Voltura%20al%20PRA&cf=DDOFNC93L17D423L&indirizzo=$(python3 -c 'import urllib.parse;print(urllib.parse.quote("CONTRADA CASAZZE 142 91025 MARSALA TP"))')" 2>/dev/null)
printf '%s' "$R" | python3 -c "
import sys,json
try: d=json.load(sys.stdin)
except Exception as e: print('NON JSON',e); sys.exit()
pd=d.get('prevDump') or {}
print('arr:', json.dumps(pd.get('arr')))
print('--- quotazioni[0]:'); print((pd.get('q0') or 'ASSENTE'))
print('--- tariffe[0]:'); print((pd.get('t0') or 'ASSENTE'))
" 2>&1 | head -40
