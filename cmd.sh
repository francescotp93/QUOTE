cd /opt/withus-backend
for i in $(seq 1 26); do h=$(git rev-parse --short HEAD); [ "$h" = "622471a" ] && { echo "deploy giro $i"; break; }; sleep 5; done
systemctl restart moto-scraper 2>/dev/null; sleep 2
B=http://127.0.0.1:4100
for i in $(seq 1 30); do curl -s -m 6 "$B/status" >/dev/null 2>&1 && { echo "up giro $i"; break; }; sleep 4; done
sleep 3
curl -s -m 185 "$B/flowmap?targa=FA85248&nascita=19/05/1995&comune=TRAPANI&cf=LMBNGL95E19D423D&steps=9" > /tmp/fm.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/fm.json"))
seq=d.get("seq") or []
# l'ultimo step (dove si blocca) è il più interessante
for i,s in enumerate(seq):
  print(f"STEP{i}: ...{(s.get('url') or '')[-22:]} cf={s.get('cf')} comune={s.get('comune')} clicked={s.get('clicked')} prezzi={s.get('prezzi')}")
last=seq[-1] if seq else {}
det=last.get("dettaglio") or {}
print("\n=== ULTIMO STEP — campi ===")
for c in (det.get("campi") or []): print("  ",c.get("tag"),c.get("type"),"req" if c.get("req") else "","chk="+str(c.get("checked")) if c.get("checked") is not None else "","|",(c.get("ph") or c.get("lab") or "")[:45],"| val:",c.get("val"))
print("BTNS:",[ b.get("t")+("!DIS" if b.get("dis") else "") for b in (det.get("btns") or [])])
print("\n=== bodyText ===\n",(det.get("bodyText") or "")[:1100])
PY
