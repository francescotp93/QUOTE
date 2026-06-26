cd /opt/withus-backend
echo "=== attendo fix 81dcf2c (autopull riavvia italiana) ==="
for i in $(seq 1 30); do h=$(git rev-parse --short HEAD 2>/dev/null); [ "$h" = "81dcf2c" ] && { echo "HEAD=$h giro $i"; break; }; sleep 5; done
echo "=== attendo scraper su (post-restart) ==="
for i in $(seq 1 25); do curl -s -m 6 http://127.0.0.1:4300/status >/dev/null 2>&1 && { echo "up giro $i"; break; }; sleep 3; done
sleep 4
echo "=== /premio GY263BY ==="
curl -s -m 220 "http://127.0.0.1:4300/premio?targa=GY263BY&situazione=Rinnovo" > /tmp/pr.json
python3 - <<'PY'
import json
try: d=json.load(open('/tmp/pr.json'))
except Exception as e: print('JSON ERR:',e); print(open('/tmp/pr.json').read()[:200]); raise SystemExit
p=d.get('premio') or {}
print('ok:',d.get('ok'),'error:',d.get('error'))
print('ANNUALE:',p.get('premio_annuale'),'| imponibile:',p.get('premio_imponibile'),'| sconto_tariffa:',p.get('sconto_tariffa'),'| sconto_quotazione:',p.get('sconto_quotazione'))
print('garanzie:',[(g.get('nome'),g.get('premio')) for g in (p.get('garanzie') or [])])
print('LOG:')
for x in (d.get('log') or []): print('  ',x)
PY
