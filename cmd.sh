B=http://127.0.0.1:4100
echo "stato sniff: $(curl -s -m 8 $B/sniff)"
curl -s -m 15 "$B/sniff/stop" > /tmp/sn.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/sn.json"))
calls=d.get("chiamate") or []
print("totale catturate:",d.get("totale"))
# endpoint unici (non rumore)
seen={}
for c in calls:
  u=(c.get("→") or c.get("url") or "").split("?")[0]
  if u and "ghost" not in u and "getuserdata" not in u: seen[u]=seen.get(u,0)+1
print("endpoint toccati:")
for k,v in seen.items(): print("  ",k,"x",v)
# cerco il calcolo premio
print("\n=== chiamate premio/calcolo ===")
for c in calls:
  u=c.get("→") or c.get("url") or ""
  if any(k in u.lower() for k in ['calc','premi','price','quotation/v2/sav','/policy','/contract','quote/','/payment','getquot','/result']):
    if "→" in c: print(f"[{c.get('t')}] REQ {c.get('→')}"); print("  body:",(c.get('body') or '')[:1400])
    else: print(f"[{c.get('t')}] <-{c.get('←')} {c.get('url')}"); print("  resp:",(c.get('body') or '')[:1400])
PY
