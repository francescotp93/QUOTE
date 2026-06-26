B=http://127.0.0.1:4300
echo "=== /preventivazione step1: campi ==="
curl -s -m 70 "$B/explore?goto=/preventivazione" | python3 -c '
import sys,json
d=json.load(sys.stdin)
for f in (d.get("fields") or [])[:30]:
  print("  ",f.get("tag"),f.get("type"),"id=",f.get("id"),"name=",f.get("name"),"| label=",(f.get("label") or "")[:50])
' 2>/dev/null
echo; echo "=== provo a selezionare prodotti moto-ish ==="
for prod in "Moto" "Ciclomotore" "Motociclo" "Motoveicolo"; do
  r=$(curl -s -m 70 "$B/explore?goto=/preventivazione&select=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$prod")")
  sel=$(echo "$r" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("did",{}).get("selected"))' 2>/dev/null)
  echo "  select '$prod' -> $sel"
done
