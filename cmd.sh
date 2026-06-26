cd /opt/withus-backend
echo "=== attendo fix 752ed15 ==="
for i in $(seq 1 24); do h=$(git rev-parse --short HEAD 2>/dev/null); [ "$h" = "752ed15" ] && { echo "HEAD=$h giro $i"; break; }; sleep 5; done
echo "=== restart SOLO italiana (no kill manuali) ==="
systemctl restart italiana-scraper
for i in $(seq 1 25); do curl -s -m 6 http://127.0.0.1:4300/status >/dev/null 2>&1 && { echo "up giro $i"; break; }; sleep 3; done
sleep 4
echo "=== istanze italiana (cgroup) ==="
systemctl status italiana-scraper --no-pager 2>/dev/null | grep -E 'Main PID|node quote-service' | head
echo "=== status ==="; curl -s -m 10 http://127.0.0.1:4300/status; echo
echo "=== /premio GY263BY (sconto massimo + guida esperta) ==="
curl -s -m 220 "http://127.0.0.1:4300/premio?targa=GY263BY&situazione=Rinnovo" > /tmp/pr.json
echo "bytes: $(wc -c < /tmp/pr.json)"; head -c 160 /tmp/pr.json; echo
python3 - <<'PY'
import json
try: d=json.load(open('/tmp/pr.json'))
except Exception as e: print('JSON ERR:',e); raise SystemExit
p=d.get('premio') or {}
print('ok:',d.get('ok'),'error:',d.get('error'))
print('annuale:',p.get('premio_annuale'),'sconto_tariffa:',p.get('sconto_tariffa'),'sconto_quotazione:',p.get('sconto_quotazione'))
print('garanzie:',[(g.get('nome'),g.get('premio')) for g in (p.get('garanzie') or [])])
for x in (d.get('log') or []): print('  ',x)
PY
