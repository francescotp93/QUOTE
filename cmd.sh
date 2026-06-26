cd /opt/withus-backend
for i in $(seq 1 30); do h=$(git rev-parse --short HEAD 2>/dev/null); [ "$h" = "0368d0a" ] && { echo "HEAD=$h giro $i"; break; }; sleep 5; done
for i in $(seq 1 25); do curl -s -m 6 http://127.0.0.1:4300/status >/dev/null 2>&1 && { echo "up giro $i"; break; }; sleep 3; done
sleep 4
echo "=== /premio GY263BY ==="
curl -s -m 220 "http://127.0.0.1:4300/premio?targa=GY263BY&situazione=Rinnovo" > /tmp/pr.json
python3 - <<'PY'
import json
try: d=json.load(open('/tmp/pr.json'))
except Exception as e: print('ERR',e,open('/tmp/pr.json').read()[:200]); raise SystemExit
p=d.get('premio') or {}
print('ok:',d.get('ok'),'ANNUALE:',p.get('premio_annuale'),'sconto_quotazione:',p.get('sconto_quotazione'),'sconto_tariffa:',p.get('sconto_tariffa'))
for x in (d.get('log') or []): print('  ',x)
PY
