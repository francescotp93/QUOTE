B=http://127.0.0.1:4300
for i in $(seq 1 20); do curl -s -m 6 "$B/status" >/dev/null 2>&1 && break; sleep 3; done
echo "=== /premio?targa=FA85248&situazione=Voltura al PRA ==="
curl -s -m 230 "$B/premio?targa=FA85248&situazione=$(python3 -c 'import urllib.parse;print(urllib.parse.quote("Voltura al PRA"))')" > /tmp/pr.json
python3 - <<'PY'
import json
try: d=json.load(open('/tmp/pr.json'))
except Exception as e: print('ERR',e,open('/tmp/pr.json').read()[:200]); raise SystemExit
p=d.get('premio') or {}
print('ok:',d.get('ok'),'error:',d.get('error'))
print('ANNUALE:',p.get('premio_annuale'),'tariffa:',p.get('tariffa'),'prodotto:',p.get('prodotto'))
print('garanzie:',[(g.get('nome'),g.get('premio')) for g in (p.get('garanzie') or [])])
print('LOG:')
for x in (d.get('log') or []): print('  ',x)
PY
