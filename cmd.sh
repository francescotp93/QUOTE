B=http://127.0.0.1:4100
curl -s -m 15 "$B/sniff/stop" > /tmp/sn.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/sn.json"))
calls=d.get("chiamate") or []
for c in calls:
  t=c.get("t") or 0
  if t<75000: continue
  u=c.get("→") or c.get("url") or ""
  if "ghost" in u or "getuserdata" in u: continue
  if "→" in c:
    print(f"\n[{t}] REQ {c.get('→')}")
    if c.get("body"): print("  body:",c["body"][:1200])
  else:
    print(f"[{t}] <-{c.get('←')} {c.get('url')}")
    if c.get("body"): print("  resp:",c["body"][:1200])
PY
