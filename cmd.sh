cd /opt/withus-backend
for i in $(seq 1 26); do h=$(git rev-parse --short HEAD); [ "$h" = "dfaf401" ] && { echo "deploy giro $i"; break; }; sleep 5; done
systemctl restart moto-scraper 2>/dev/null; sleep 2
B=http://127.0.0.1:4100
for i in $(seq 1 30); do curl -s -m 6 "$B/status" >/dev/null 2>&1 && { echo "up giro $i"; break; }; sleep 4; done
sleep 3
curl -s -m 10 "$B/sniff/start" >/dev/null
curl -s -m 185 "$B/flowmap?targa=FA85248&nascita=19/05/1995&comune=TRAPANI&cf=LMBNGL95E19D423D&steps=9" > /tmp/fm.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/fm.json"))
for i,s in enumerate(d.get("seq") or []):
  print(f"STEP{i}: ...{(s.get('url') or '')[-24:]} cf={s.get('cf')} comune={s.get('comune')} clicked={s.get('clicked')} prezzi={s.get('prezzi')}")
PY
echo "=== PREMIO/calcolo nelle chiamate ==="
curl -s -m 15 "$B/sniff/stop" > /tmp/sn.json
python3 - <<'PY'
import json,re
d=json.load(open("/tmp/sn.json"))
calls=d.get("chiamate") or []
print("totale:",d.get("totale"))
seen=set()
for c in calls:
  u=(c.get("→") or c.get("url") or "").split("?")[0]
  if u and "ghost" not in u and "getuserdata" not in u and u not in seen: seen.add(u)
print("endpoint toccati:")
for x in sorted(seen): print("  ",x)
print("\n=== chiamate con prezzo/premio nella risposta ===")
for c in calls:
  if "←" in c and c.get("body") and re.search(r'premium|price|"premio"|importo|totale|\d{2,4}[.,]\d{2}', c.get("body"), re.I):
    u=c.get("url","")
    if "ghost" in u or "istat" in u: continue
    print(f"[{c.get('t')}] <-{c.get('←')} {u}"); print("  resp:",c["body"][:1200])
PY
