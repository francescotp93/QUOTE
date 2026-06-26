B=http://127.0.0.1:4100
curl -s -m 15 "$B/sniff/stop" > /tmp/sn.json
python3 - <<'PY'
import json
d=json.load(open('/tmp/sn.json'))
calls=d.get("chiamate") or []
print("totale chiamate filtrate:",len(calls))
# mostro dalla 25 in poi (oltre infobike) le chiamate quotation/product/premium con body
for c in calls:
  u = c.get('→') or c.get('url') or ''
  if any(k in u for k in ['/quotation/','/premium','/price','/calculate','/person','/vehicle/set','/contractor','/owner','/product/v2/set','/product/v2/calculate','/quote']):
    if '→' in c:
      print(f"\n[{c.get('t')}] REQ {c.get('→')}")
      if c.get('body'): print("  body:",c['body'][:700])
    else:
      print(f"[{c.get('t')}]  <-{c.get('←')} {c.get('url')}")
      if c.get('body'): print("  resp:",c['body'][:700])
PY
