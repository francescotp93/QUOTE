B=http://127.0.0.1:4100
# riuso /flowmap che arriva a quotation/options, poi leggo lo screen via /shot? no: aggiungo lettura inline
curl -s -m 188 "$B/flowmap?targa=FA85248&nascita=19/05/1995&comune=TRAPANI&cf=LMBNGL95E19D423D&steps=9" > /tmp/fm.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/fm.json"))
seq=d.get("seq") or []
last=seq[-1] if seq else {}
print("ultimo step url:", last.get("url"))
print("prezzi:", last.get("prezzi"))
det=last.get("dettaglio") or {}
print("\n=== bodyText schermata prezzo ===")
print((det.get("bodyText") or "")[:1500])
print("\n=== btns ===", [b.get("t") for b in (det.get("btns") or [])])
PY
