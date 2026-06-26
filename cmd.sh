cd /opt/withus-backend
for i in $(seq 1 26); do h=$(git rev-parse --short HEAD); [ "$h" = "d4da7e1" ] && { echo "deploy giro $i"; break; }; sleep 5; done
systemctl restart moto-scraper 2>/dev/null; sleep 2
B=http://127.0.0.1:4100
for i in $(seq 1 30); do curl -s -m 6 "$B/status" >/dev/null 2>&1 && { echo "up giro $i"; break; }; sleep 4; done
sleep 3
echo "=== /apigrep: endpoint /api/ del portale 24H ==="
curl -s -m 90 "$B/apigrep" | python3 -c '
import sys,json
d=json.load(sys.stdin)
print("files JS:",d.get("files"))
eps=d.get("endpoints") or []
print("totale endpoint:",len(eps))
import re
print("--- premio/calcolo/quotation/save ---")
for e in eps:
  if re.search(r"calc|premi|price|quot|save|comput|estimat|tariff|result|emit|policy|contract",e,re.I): print("  ",e)
print("--- tutti (primi 60) ---")
for e in eps[:60]: print("  ",e)
' 2>/dev/null
