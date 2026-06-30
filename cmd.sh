systemctl start withus-autopull.service 2>/dev/null || true
for i in $(seq 1 24); do git -C /opt/withus-backend log --oneline -1 2>/dev/null | grep -q "datepicker jQuery" && break; sleep 5; done
for i in $(seq 1 30); do curl -s --max-time 6 http://127.0.0.1:4300/status 2>/dev/null | grep -q '"loggato": *true' && break; sleep 4; done
echo "=== Voltura GY263BY (datepicker jQuery) ==="
T0=$(date +%s)
R=$(curl -s --max-time 175 "http://127.0.0.1:4300/premio?targa=GY263BY&situazione=Voltura%20al%20PRA&cf=DDOFNC93L17D423L&indirizzo=$(python3 -c 'import urllib.parse;print(urllib.parse.quote("CONTRADA CASAZZE 142 91025 MARSALA TP"))')" 2>/dev/null)
T1=$(date +%s)
echo "tempo $((T1-T0))s"
printf '%s' "$R" | python3 -c "
import sys,json
try: d=json.load(sys.stdin)
except: print('NON JSON:', sys.stdin.read()[:120]); sys.exit()
p=d.get('premio') or {}
print('>>> ok:',d.get('ok'),'| PREMIO:',p.get('premio_annuale'),'| step:',d.get('step'))
print('campi vuoti:', [(c.get('id') or c.get('name')) for c in (d.get('campiVuoti') or [])][:8])
for l in (d.get('log') or []):
    s=str(l)
    if 'data ultima voltura' in s.lower() or 'step:' in s.lower(): print('  ',s[:120])
" 2>&1 | head -16
