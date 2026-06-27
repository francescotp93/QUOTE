cd /opt/withus-backend
for i in $(seq 1 26); do h=$(git rev-parse --short HEAD); [ "$h" = "b1ee3ee" ] && { echo "deploy giro $i"; break; }; sleep 5; done
systemctl restart moto-scraper 2>/dev/null; sleep 2
B=http://127.0.0.1:4100
for i in $(seq 1 30); do curl -s -m 6 "$B/status" >/dev/null 2>&1 && { echo "up giro $i"; break; }; sleep 4; done
sleep 3
curl -s -m 200 "$B/quote?targa=FA85248&nascita=19/05/1995&cf=LMBNGL95E19D423D&comune=TRAPANI" > /tmp/q.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/q.json"))
print("ok:",d.get("ok"))
print("prezzi con etichetta:")
for p in (d.get("prezziConContesto") or []): print("   ",p.get("prezzo"),"<=",p.get("ctx"))
print("\nPAGE TEXT:")
print((d.get("pageText") or "")[:1300])
PY
