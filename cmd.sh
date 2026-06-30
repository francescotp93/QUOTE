echo "=== Italiana Voltura GY263BY, contraente con indirizzo COMPLETO ==="
T0=$(date +%s)
R=$(curl -s --max-time 175 "http://127.0.0.1:4300/premio?targa=GY263BY&situazione=Voltura%20al%20PRA&cf=DDOFNC93L17D423L&indirizzo=$(python3 -c 'import urllib.parse;print(urllib.parse.quote("CONTRADA CASAZZE 142 91025 MARSALA TP"))')" 2>/dev/null)
T1=$(date +%s)
echo "tempo $((T1-T0))s"
echo "$R" | python3 -c "
import sys,json
d=json.load(sys.stdin)
p=d.get('premio') or {}
print('ok:',d.get('ok'),'| premio:',p.get('premio_annuale'),'| step:',d.get('step'))
print('log (anagrafica/step):')
for l in (d.get('log') or []):
    s=str(l)
    if any(k in s.lower() for k in ('anagra','step','popup','voltura','indirizz','sister','obbligat')): print('  ',s[:150])
" 2>&1 | head -22
