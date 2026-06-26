B=http://127.0.0.1:4100
curl -s -m 15 "$B/sniff/stop" > /tmp/sn.json
python3 - <<'PY'
import json
d=json.load(open('/tmp/sn.json'))
calls=d.get("chiamate") or []
print("totale filtrate:",len(calls)," (su",d.get("totale"),"totali)")
for c in calls:
  u=c.get('→') or c.get('url') or ''
  if 'ghost' in u or '/getuserdata' in u or 'getPendingOperations' in u: continue
  if '→' in c:
    print(f"\n[{c.get('t')}] REQ {c.get('→')}")
    if c.get('body'): print("  body:",c['body'][:1100])
  else:
    print(f"[{c.get('t')}]  <-{c.get('←')} {c.get('url')}")
    if c.get('body'): print("  resp:",c['body'][:1100])
PY
