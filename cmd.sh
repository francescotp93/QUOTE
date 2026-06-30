echo "=== Italiana DT803VN come RINNOVO (il veicolo si quota?) ==="
T0=$(date +%s); R=$(curl -s --max-time 150 "http://127.0.0.1:4300/premio?targa=DT803VN&situazione=Rinnovo" 2>/dev/null); T1=$(date +%s)
echo "tempo $((T1-T0))s"
echo "$R" | python3 -c "
import sys,json
d=json.load(sys.stdin)
p=d.get('premio') or {}
print('ok:',d.get('ok'),'| premio:',p.get('premio_annuale'),'| step:',d.get('step'))
print('log:')
for l in (d.get('log') or [])[-8:]: print('  ',str(l)[:140])
" 2>&1 | head -16
