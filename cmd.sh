cd /opt/withus-backend
for i in $(seq 1 26); do h=$(git rev-parse --short HEAD); [ "$h" = "17f9e52" ] && { echo "deploy giro $i"; break; }; sleep 5; done
systemctl restart moto-scraper 2>/dev/null; sleep 2
B=http://127.0.0.1:4100
for i in $(seq 1 30); do curl -s -m 6 "$B/status" >/dev/null 2>&1 && { echo "up giro $i"; break; }; sleep 4; done
sleep 3
curl -s -m 190 "$B/flowmap?targa=FA85248&nascita=19/05/1995&comune=TRAPANI&cf=LMBNGL95E19D423D&steps=9" > /tmp/fm.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/fm.json"))
seq=d.get("seq") or []
for i,s in enumerate(seq):
  print(f"STEP{i}: ...{(s.get('url') or '')[-24:]} clicked={s.get('clicked')} PREZZI={s.get('prezzi')}")
last=seq[-1] if seq else {}
det=last.get("dettaglio") or {}
print("\n=== TESTO schermata prezzo (per mappare i numeri) ===")
print((det.get("bodyText") or "")[:1600])
PY
