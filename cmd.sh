cd /opt/withus-backend
for i in $(seq 1 26); do h=$(git rev-parse --short HEAD); [ "$h" = "11fb746" ] && { echo "deploy giro $i"; break; }; sleep 5; done
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
  print(f"STEP{i}: ...{(s.get('url') or '')[-24:]} allest={s.get('allestimento')} cf={s.get('cf')} comune={s.get('comune')} clicked={s.get('clicked')} prezzi={s.get('prezzi')}")
PY
echo "=== PREMIO? chiamate calcolo ==="
curl -s -m 15 "$B/sniff/stop" > /tmp/sn.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/sn.json"))
for c in (d.get("chiamate") or []):
  u=c.get("→") or c.get("url") or ""
  if any(k in u for k in ['calculate','premium','price','/quote/','calcola','/save','/contractor','/person','/policy','quotation/v2/save','quotation/v2/calc']):
    if "→" in c:
      print(f"\n[{c.get('t')}] REQ {c.get('→')}");  print("  body:",(c.get('body') or '')[:1500])
    else:
      print(f"[{c.get('t')}] <-{c.get('←')} {c.get('url')}"); print("  resp:",(c.get('body') or '')[:1500])
# inoltre elenco TUTTI gli endpoint unici toccati (per non perdere il calcolo)
seen=set()
for c in (d.get("chiamate") or []):
  u=(c.get("→") or c.get("url") or "")
  key=u.split('?')[0]
  if key and key not in seen and 'ghost' not in key and 'getuserdata' not in key:
    seen.add(key)
print("\n=== endpoint unici toccati ==="); [print(" ",x) for x in sorted(seen)]
PY
