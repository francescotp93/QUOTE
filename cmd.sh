B=http://127.0.0.1:4300
echo "=== deploy HEAD ==="
cd /opt/withus-backend && git log --oneline -1 -- scraper/italiana/quote-service.mjs
echo "=== warmup (status + login per riscaldare la sessione) ==="
for i in $(seq 1 25); do curl -s -m 6 "$B/status" >/dev/null 2>&1 && { echo "up giro $i"; break; }; sleep 3; done
curl -s -m 60 "$B/login" >/dev/null; echo "login fatto"
echo "=== /premio GY263BY ==="
curl -s -m 220 "$B/premio?targa=GY263BY&situazione=Rinnovo" > /tmp/pr.json
echo "bytes: $(wc -c < /tmp/pr.json)"; head -c 200 /tmp/pr.json; echo
python3 - <<'PY'
import json
try: d=json.load(open('/tmp/pr.json'))
except Exception as e: print('JSON ERR:',e); raise SystemExit
p=d.get('premio') or {}
print('ok:',d.get('ok'),'error:',d.get('error'))
print('annuale:',p.get('premio_annuale'),'imponibile:',p.get('premio_imponibile'),'sconto_tariffa:',p.get('sconto_tariffa'),'sconto_quotazione:',p.get('sconto_quotazione'))
print('garanzie:',[(g.get('nome'),g.get('premio')) for g in (p.get('garanzie') or [])])
for x in (d.get('log') or []): print('  ',x)
PY
