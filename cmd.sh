cd /opt/withus-backend
for i in $(seq 1 30); do h=$(git rev-parse --short HEAD 2>/dev/null); [ "$h" = "0e54e7d" ] && { echo "deploy 0e54e7d giro $i"; break; }; sleep 5; done
B=http://127.0.0.1:4300
for i in $(seq 1 25); do curl -s -m 6 "$B/status" >/dev/null 2>&1 && { echo "scraper up giro $i"; break; }; sleep 3; done
sleep 3
for q in moto ciclo; do
  echo "=== /motoprobe?q=$q ==="
  curl -s -m 80 "$B/motoprobe?q=$q" | python3 -c '
import sys,json
d=json.load(sys.stdin)
r=d.get("r") or {}
print("select2:",r.get("select2"),"| steps:",r.get("steps"))
print("dataset:",json.dumps(r.get("dataset") or {})[:200])
for o in (r.get("options") or [])[:15]: print("   opt:",o)
cap=d.get("captured") or []
import re
for c in cap:
  s=json.dumps(c)
  if re.search(r"prodott|moto|ciclo",s,re.I): print("   ajax*:",s[:300])
' 2>/dev/null
done
