echo "=== BASELINE Italiana /premio GY263BY Rinnovo (premio + tempo) ==="
T0=$(date +%s)
R=$(curl -s --max-time 170 "http://127.0.0.1:4300/premio?targa=GY263BY&situazione=Rinnovo" 2>/dev/null)
T1=$(date +%s)
echo "tempo: $((T1-T0))s"
echo "$R" | python3 -c "
import sys,json
d=json.load(sys.stdin)
p=d.get('premio') or {}
print('ok:',d.get('ok'),'| step:',d.get('step'))
print('prodotto:',p.get('prodotto'),'| premio_annuale:',p.get('premio_annuale'),'| premio_rata:',p.get('premio_rata'))
print('sconto_tariffa:',p.get('sconto_tariffa'),'| sconto_quotazione:',p.get('sconto_quotazione'))
print('garanzie:',[(g.get('nome'),g.get('premio')) for g in (p.get('garanzie') or [])][:8])
print('--- log ---')
for l in (d.get('log') or []): print('  ',l)
"
