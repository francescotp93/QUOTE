cd /opt/withus-backend
for i in $(seq 1 30); do h=$(git rev-parse --short HEAD 2>/dev/null); [ "$h" = "754e290" ] && { echo "deploy 754e290 giro $i"; break; }; sleep 5; done
B=http://127.0.0.1:4300
for i in $(seq 1 25); do curl -s -m 6 "$B/status" >/dev/null 2>&1 && { echo "up giro $i"; break; }; sleep 3; done
sleep 3
echo "=== REGRESSIONE auto Rinnovo GY263BY + cf (deve restare ~381, anagrafica NON toccata) ==="
t0=$(date +%s)
curl -s -m 220 "$B/premio?targa=GY263BY&situazione=Rinnovo&cf=DDOFNC93L17D423L" > /tmp/pr.json
echo "durata: $(( $(date +%s)-t0 ))s"
python3 - <<'PY'
import json
d=json.load(open('/tmp/pr.json'))
p=d.get('premio') or {}
print('ok:',d.get('ok'),'ANNUALE:',p.get('premio_annuale'))
for x in (d.get('log') or []):
  if 'anagrafica' in x or 'sconto max' in x or 'conducente' in x: print('  ',x)
PY
