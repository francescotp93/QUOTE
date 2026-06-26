cd /opt/withus-backend
for i in $(seq 1 30); do h=$(git rev-parse --short HEAD 2>/dev/null); [ "$h" = "7323118" ] && { echo "deploy 7323118 giro $i"; break; }; sleep 5; done
B=http://127.0.0.1:4300
for i in $(seq 1 25); do curl -s -m 6 "$B/status" >/dev/null 2>&1 && { echo "up giro $i"; break; }; sleep 3; done
sleep 3
echo "=== /anagprobe?targa=FA85248 (Voltura -> Anagrafiche) ==="
curl -s -m 120 "$B/anagprobe?targa=FA85248&situazione=$(python3 -c 'import urllib.parse;print(urllib.parse.quote("Voltura al PRA"))')" > /tmp/ap.json
python3 - <<'PY'
import json
d=json.load(open('/tmp/ap.json'))
print("step finale:",d.get("step"),"| error:",d.get("error"))
print("LOG:")
for x in (d.get("log") or []): print("  ",x)
print("CAMPI:")
for c in (d.get("campi") or []):
  print("  ",c.get("tag"),c.get("type"),"id=",c.get("id"),"name=",c.get("name"),"ph=",c.get("ph"),"| ",c.get("label"))
PY
