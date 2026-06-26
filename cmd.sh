cd /opt/withus-backend
for i in $(seq 1 30); do h=$(git rev-parse --short HEAD 2>/dev/null); [ "$h" = "e6128c1" ] && { echo "deploy e6128c1 giro $i"; break; }; sleep 5; done
B=http://127.0.0.1:4300
for i in $(seq 1 25); do curl -s -m 6 "$B/status" >/dev/null 2>&1 && { echo "scraper up giro $i"; break; }; sleep 3; done
sleep 3
echo "=== /premio GY263BY + garanzia infortuni_conducente (cronometro) ==="
t0=$(date +%s)
curl -s -m 220 "$B/premio?targa=GY263BY&situazione=Rinnovo&garanzie=infortuni_conducente" > /tmp/pr.json
t1=$(date +%s)
echo "DURATA: $((t1-t0))s"
python3 - <<'PY'
import json
try: d=json.load(open('/tmp/pr.json'))
except Exception as e: print('ERR',e); raise SystemExit
p=d.get('premio') or {}
print('ok:',d.get('ok'),'ANNUALE:',p.get('premio_annuale'))
print('garanzie:',[(g.get('nome'),g.get('premio')) for g in (p.get('garanzie') or [])])
PY
