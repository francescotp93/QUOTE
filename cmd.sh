B=http://127.0.0.1:4300
echo "=== /preventivazione: prodotti disponibili ==="
curl -s -m 70 "$B/explore?goto=/preventivazione" > /tmp/pv.json
python3 - <<'PY'
import json,re
d=json.load(open('/tmp/pv.json'))
print("url:",d.get("url"),"| title:",d.get("title"))
print("--- voci menu (tutte, prime 80) ---")
for m in (d.get("menu") or [])[:80]:
  print("  ",m[:130])
PY
