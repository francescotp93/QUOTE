cd /opt/withus-backend
for i in $(seq 1 26); do h=$(git rev-parse --short HEAD); [ "$h" = "9ea9dd2" ] && { echo "deploy 9ea9dd2 giro $i"; break; }; sleep 5; done
systemctl restart moto-scraper 2>/dev/null; sleep 2
B=http://127.0.0.1:4100
for i in $(seq 1 30); do curl -s -m 6 "$B/status" >/dev/null 2>&1 && { echo "moto up giro $i"; break; }; sleep 4; done
sleep 3
echo "=== sniff ON + flowmap (auto-drive) ==="
curl -s -m 10 "$B/sniff/start" >/dev/null
curl -s -m 170 "$B/flowmap?targa=FA85248&nascita=19/05/1995&comune=TRAPANI" > /tmp/fm.json
python3 -c 'import json;d=json.load(open("/tmp/fm.json"));seq=d.get("seq") or [];print("flowmap steps:",len(seq));[print(f"  step{i}: url=...{s.get(chr(39)+chr(117)+chr(114)+chr(108)+chr(39)) if False else s.get(\"url\")} allest={s.get(\"allestimento\")} comune={s.get(\"comune\")} clicked={s.get(\"clicked\")} prezzi={s.get(\"prezzi\")}") for i,s in enumerate(seq)]' 2>/dev/null
echo "=== sniff STOP — chiamate quotazione/premio ==="
curl -s -m 15 "$B/sniff/stop" > /tmp/sn.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/sn.json"))
calls=d.get("chiamate") or []
print("totale:",d.get("totale"))
for c in calls:
  u=c.get("→") or c.get("url") or ""
  if "ghost" in u or "getuserdata" in u or "getPendingOperations" in u: continue
  if "→" in c:
    print(f"\n[{c.get('t')}] REQ {c.get('→')}")
    if c.get("body"): print("  body:",c["body"][:500])
  else:
    print(f"[{c.get('t')}] <-{c.get('←')} {c.get('url')}")
    if c.get("body"): print("  resp:",c["body"][:500])
PY
