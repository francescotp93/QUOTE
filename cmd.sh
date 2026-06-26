B=http://127.0.0.1:4300
echo "=== outerHTML di #id_prodotto (data-attr select2 ajax) + cattura ajax al load ==="
curl -s -m 70 "$B/explore?goto=/preventivazione&sniff=1" > /tmp/pv.json
python3 - <<'PY'
import json
d=json.load(open('/tmp/pv.json'))
cap=d.get('captured') or []
print("chiamate __ajax catturate:")
for c in cap[:25]:
    s=json.dumps(c)
    print("  ",s[:200])
PY
echo "=== config select2 prodotti (creaSelect2Plurima + ajax data) ==="
curl -s "$B/jsgrep?q=function%20creaSelect2Plurima&before=5&after=1400" | python3 -c '
import sys,json
d=json.load(sys.stdin)
for w in (d.get("windows") or [])[:1]: print(w.get("snippet",""))
' 2>/dev/null
