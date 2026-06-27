cd /opt/withus-backend
for i in $(seq 1 26); do h=$(git rev-parse --short HEAD); [ "$h" = "fd4834e" ] && { echo "deploy giro $i"; break; }; sleep 5; done
systemctl restart moto-scraper 2>/dev/null; sleep 2
B=http://127.0.0.1:4100
for i in $(seq 1 30); do curl -s -m 6 "$B/status" >/dev/null 2>&1 && { echo "up giro $i"; break; }; sleep 4; done
sleep 3
echo "=== /quote nuovo flusso FA85248 + cf + comune ==="
curl -s -m 200 "$B/quote?targa=FA85248&nascita=19/05/1995&cf=LMBNGL95E19D423D&comune=TRAPANI" > /tmp/q.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/q.json"))
print("ok:",d.get("ok"),"url:",(d.get("url") or "")[-30:])
print("drive_log:",d.get("drive_log"))
print("prezzi:",d.get("prezzi"))
print("prezzi con contesto:")
for p in (d.get("prezziConContesto") or []): print("   ",p.get("prezzo"),"<=",p.get("ctx"))
PY
