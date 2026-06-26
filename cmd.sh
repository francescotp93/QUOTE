B=http://127.0.0.1:4300
echo "=== /auto targa+voltura -> step Anagrafiche: campi da compilare ==="
curl -s -m 90 "$B/explore?goto=/auto&fill=FA85248&select=Voltura&then=Successivo" > /tmp/an.json
python3 - <<'PY'
import json
d=json.load(open('/tmp/an.json'))
print("url:",d.get("url"))
print("did:",json.dumps(d.get("did")))
print("--- campi (input/select) ---")
for f in (d.get("fields") or [])[:45]:
  print("  ",f.get("tag"),f.get("type"),"id=",f.get("id"),"name=",f.get("name"),"| ",(f.get("label") or "")[:40])
PY
