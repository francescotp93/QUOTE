echo "=== Voltura GY263BY con data_voltura PASSATA (01/06/2026) ==="
T0=$(date +%s)
R=$(curl -s --max-time 175 "http://127.0.0.1:4300/premio?targa=GY263BY&situazione=Voltura%20al%20PRA&cf=DDOFNC93L17D423L&data_voltura=01/06/2026&indirizzo=$(python3 -c 'import urllib.parse;print(urllib.parse.quote("CONTRADA CASAZZE 142 91025 MARSALA TP"))')" 2>/dev/null)
T1=$(date +%s)
echo "tempo $((T1-T0))s"
printf '%s' "$R" | python3 -c "
import sys,json
try: d=json.load(sys.stdin)
except: print('NON JSON:', sys.stdin.read()[:120]); sys.exit()
p=d.get('premio') or {}
print('>>> ok:',d.get('ok'),'| PREMIO:',p.get('premio_annuale'),'| step:',d.get('step'))
print('campi vuoti:', [(c.get('id') or c.get('name')) for c in (d.get('campiVuoti') or [])][:6])
for l in (d.get('log') or []):
    s=str(l)
    if 'data ultima voltura' in s.lower() or 'step:' in s.lower(): print('  ',s[:110])
" 2>&1 | head -14
