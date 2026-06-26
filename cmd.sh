B=http://127.0.0.1:4300
for i in $(seq 1 20); do curl -s -m 6 "$B/status" >/dev/null 2>&1 && break; sleep 3; done
echo "=== /premio GY263BY con garanzie cristalli,assistenza,infortuni_conducente ==="
curl -s -m 230 "$B/premio?targa=GY263BY&situazione=Rinnovo&garanzie=cristalli,assistenza,infortuni_conducente" > /tmp/pr.json
python3 - <<'PY'
import json
try: d=json.load(open('/tmp/pr.json'))
except Exception as e: print('ERR',e,open('/tmp/pr.json').read()[:200]); raise SystemExit
p=d.get('premio') or {}
print('ok:',d.get('ok'),'ANNUALE:',p.get('premio_annuale'))
print('garanzie nel premio:')
for g in (p.get('garanzie') or []): print('   -',g.get('nome'),'=',g.get('premio'))
print('LOG:')
for x in (d.get('log') or []): print('  ',x)
PY
