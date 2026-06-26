B=http://127.0.0.1:4300
echo "=== deploy HEAD (scraper) ==="
cd /opt/withus-backend && git log --oneline -1 -- scraper/italiana/quote-service.mjs 2>/dev/null
echo "=== attendo scraper /status ==="
for i in $(seq 1 20); do curl -s -m 5 "$B/status" >/dev/null 2>&1 && { echo "scraper up (giro $i)"; break; }; sleep 3; done
echo "=== /premio GY263BY (guida esperta + sconto massimo) ==="
curl -s -m 180 "$B/premio?targa=GY263BY&situazione=Rinnovo" > /tmp/pr.json
python3 - <<'PY'
import json
d=json.load(open('/tmp/pr.json'))
p=d.get('premio') or {}
print('ok:',d.get('ok'),'| annuale:',p.get('premio_annuale'),'| imponibile:',p.get('premio_imponibile'),'| sconto_tariffa:',p.get('sconto_tariffa'),'| sconto_quotazione:',p.get('sconto_quotazione'))
print('garanzie:',[(g.get('nome'),g.get('premio')) for g in (p.get('garanzie') or [])])
print('LOG:')
for x in (d.get('log') or []): print('  ',x)
PY
