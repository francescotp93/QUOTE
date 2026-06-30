systemctl start withus-autopull.service 2>/dev/null || true
for i in $(seq 1 24); do git -C /opt/withus-backend log --oneline -1 2>/dev/null | grep -q "24H moto: fix lettura premio" && break; sleep 5; done
echo "commit: $(git -C /opt/withus-backend log --oneline -1 2>/dev/null)"
echo "=== 24H FA85248 (moto rinnovo) — ora legge il premio? ==="
T0=$(date +%s); R=$(curl -s --max-time 230 "http://127.0.0.1:4100/quote?targa=FA85248&nascita=17/07/1993&cf=DDOFNC93L17D423L&comune=Marsala" 2>/dev/null); T1=$(date +%s)
echo "tempo $((T1-T0))s"
echo "$R" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('ok:',d.get('ok'),'| premio_totale:',d.get('premio_totale'),'| premio_rca:',d.get('premio_rca'))
print('totali:',d.get('totali'))
" 2>&1 | head -5
