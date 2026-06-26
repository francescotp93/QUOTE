B=http://127.0.0.1:4300
echo "=== apro select prodotto + cerco 'moto' + catturo ajax ==="
curl -s -m 80 "$B/explore?goto=/preventivazione&click=Scegli%20un%20prodotto&fill=moto&sniff=1" > /tmp/ms.json
python3 - <<'PY'
import json,re
d=json.load(open('/tmp/ms.json'))
print("did:",json.dumps(d.get("did")))
cap=d.get("captured") or []
print("ajax catturate:",len(cap))
for c in cap:
    s=json.dumps(c)
    if re.search(r"prodott|moto|ciclo",s,re.I): print("  *",s[:500])
    else: print("  ",s[:160])
# voci menu che sembrano prodotti moto
print("--- menu con moto/ciclo ---")
for m in (d.get("menu") or []):
    if re.search(r"moto|ciclo|veicol",m,re.I): print("  ",m[:120])
PY
