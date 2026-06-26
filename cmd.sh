B=http://127.0.0.1:4300
echo "=== warmup /status + /login ==="
curl -s -m 15 "$B/status"; echo
curl -s -m 60 "$B/login" | head -c 200; echo
echo "=== /premio GY263BY (raw) ==="
curl -s -m 220 "$B/premio?targa=GY263BY&situazione=Rinnovo" > /tmp/pr.json
echo "bytes: $(wc -c < /tmp/pr.json)"
head -c 400 /tmp/pr.json; echo
echo "--- parsed ---"
python3 - <<'PY'
import json
try:
  d=json.load(open('/tmp/pr.json'))
except Exception as e:
  print('JSON ERR:',e); raise SystemExit
print('keys:',list(d.keys()))
print('ok:',d.get('ok'),'error:',d.get('error'))
p=d.get('premio') or {}
print('annuale:',p.get('premio_annuale'),'sconto_tariffa:',p.get('sconto_tariffa'))
for x in (d.get('log') or []): print('  ',x)
PY
