B=http://127.0.0.1:4300
echo "=== come si carica/cerca il prodotto (id_prodotto / select2 ajax) ==="
for q in "id_prodotto" "ricerca_prodotti" "select2" "carica_prodotti"; do
  echo "--- grep '$q' in step_1/index/ajax ---"
  curl -s "$B/jsgrep?q=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$q")&before=40&after=260" | python3 -c '
import sys,json
d=json.load(sys.stdin)
for w in (d.get("windows") or [])[:2]:
  print("FILE",w.get("file"),"@",w.get("at"))
  print(w.get("snippet","")[:340]); print()
' 2>/dev/null
done
