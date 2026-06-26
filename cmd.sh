B=http://127.0.0.1:4100
echo "stato: $(curl -s -m 8 $B/sniff)"
echo "=== /sniff/stop (chiamate catturate) ==="
curl -s -m 15 "$B/sniff/stop" > /tmp/sn.json
echo "bytes: $(wc -c < /tmp/sn.json)"
python3 - <<'PY'
import json
try: d=json.load(open('/tmp/sn.json'))
except Exception as e: print('ERR',e,open('/tmp/sn.json').read()[:300]); raise SystemExit
print("totale catturate:",d.get("totale"))
for c in (d.get("chiamate") or []):
  if '→' in c:
    print(f"[{c.get('t')}ms] {c.get('→')}")
    if c.get('body'): print("    body:",c['body'][:300])
  else:
    print(f"[{c.get('t')}ms]  <- {c.get('←')} {c.get('url')}")
    if c.get('body'): print("    resp:",c['body'][:400])
PY
