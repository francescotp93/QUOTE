B=http://127.0.0.1:4400
echo "=== HDI scraper /status ==="
curl -s -m 10 "$B/status"; echo
echo "=== HDI: pagina corrente (esploro la home per capire dove si fa il preventivo auto) ==="
curl -s -m 70 "$B/explore?goto=/" | python3 -c '
import sys,json,re
d=json.load(sys.stdin)
print("url:",d.get("url"),"| title:",d.get("title"))
print("--- voci menu (auto/preventiv/veicol) ---")
for m in (d.get("menu") or []):
  if re.search(r"auto|preventiv|veicol|polizz|quota|nuovo|rc |rca|prodott", m, re.I): print("  ",m[:110])
print("--- campi login? ---")
for f in (d.get("fields") or [])[:12]:
  print("  ",f.get("tag"),f.get("type"),"id=",f.get("id"),"name=",f.get("name"))
' 2>/dev/null
