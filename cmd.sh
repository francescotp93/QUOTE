B=http://127.0.0.1:4300
for q in motocicl ciclomotor "id_tariffa" tariffe_disponibili prodotto_autoveicoli; do
  echo "=== grep '$q' in preventivatore_auto.js ==="
  curl -s "$B/jsgrep?q=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$q")&file=preventivatore_auto&before=30&after=180" | python3 -c '
import sys,json
d=json.load(sys.stdin)
ws=d.get("windows") or []
print("match:",len(ws))
for w in ws[:2]: print(" ",w.get("snippet","")[:260].replace(chr(10)," "))
' 2>/dev/null
done
