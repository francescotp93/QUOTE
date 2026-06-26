B=http://127.0.0.1:4300
echo "=== HOME portale: voci menu moto/ciclo/veicolo/preventiv ==="
curl -s -m 60 "$B/explore?goto=/" | python3 -c '
import sys,json
d=json.load(sys.stdin)
print("title:",d.get("title"),"| url:",d.get("url"))
import re
for m in (d.get("menu") or []):
  if re.search(r"moto|ciclo|veicol|preventiv|auto|prodott|tariff|nuov", m, re.I): print("  ",m[:120])
' 2>/dev/null
echo; echo "=== provo /moto ==="
curl -s -m 60 "$B/explore?goto=/moto" | python3 -c '
import sys,json
d=json.load(sys.stdin)
print("url:",d.get("url"),"| title:",d.get("title"))
print("campi:",[ (f.get("id") or f.get("name")) for f in (d.get("fields") or [])][:20])
' 2>/dev/null
echo; echo "=== mappa azioni JS (grepjs) cerco moto/ciclo ==="
curl -s -m 90 "$B/explore?goto=/auto&grepjs=1" | python3 -c '
import sys,json,re
d=json.load(sys.stdin)
g=d.get("grepjs") or {}
print("files:",g.get("files"))
acts=[a for a in (g.get("actions") or []) if re.search(r"moto|ciclo|veicol",a,re.I)]
print("azioni moto/ciclo/veicolo:",acts)
' 2>/dev/null
