cd /opt/withus-backend
for i in $(seq 1 26); do h=$(git rev-parse --short HEAD); [ "$h" = "36f722e" ] && { echo "deploy giro $i"; break; }; sleep 5; done
systemctl restart moto-scraper 2>/dev/null; sleep 2
B=http://127.0.0.1:4100
for i in $(seq 1 30); do curl -s -m 6 "$B/status" >/dev/null 2>&1 && { echo "up giro $i"; break; }; sleep 4; done
sleep 3
curl -s -m 10 "$B/sniff/start" >/dev/null
curl -s -m 180 "$B/flowmap?targa=FA85248&nascita=19/05/1995&comune=TRAPANI&cf=LMBNGL95E19D423D" > /tmp/fm.json
echo "=== steps ==="
python3 - <<'PY'
import json
d=json.load(open("/tmp/fm.json"))
for i,s in enumerate(d.get("seq") or []):
  print(f"STEP{i}: ...{(s.get('url') or '')[-26:]} allest={s.get('allestimento')} cf={s.get('cf')} comune={s.get('comune')} clicked={s.get('clicked')} prezzi={s.get('prezzi')}")
  det=s.get("dettaglio") or {}
  if det.get('campi'): print("   campi:",[ (c.get('ph') or c.get('lab'),c.get('val')) for c in det['campi']][:8])
  if det.get('btns'): print("   btns:",[ b.get('t')+('!' if b.get('dis') else '') for b in det['btns'] if b.get('t') not in ('MOTO E SCOOTER','SCI E SNOWBOARD','TUTTI GLI SPORT','ANIMALI DOMESTICI','E-BIKE','MOBILITÀ URBANA','BARCA','BLOG','CONTATTI','POLIZZE','PREVENTIVI','OPERAZIONI IN SOSPESO','MODIFICA I TUOI DATI','SUPPORTO MOTO.APP','CONTATTACI','SITO DI SUPPORTO')])
PY
echo "=== sniff dopo CF/comune (premio) ==="
curl -s -m 15 "$B/sniff/stop" > /tmp/sn.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/sn.json"))
for c in (d.get("chiamate") or []):
  t=c.get("t") or 0
  if t<76000: continue
  u=c.get("→") or c.get("url") or ""
  if "ghost" in u or "getuserdata" in u: continue
  if "→" in c:
    print(f"\n[{t}] REQ {c.get('→')}")
    if c.get("body"): print("  body:",c["body"][:700])
  else:
    print(f"[{t}] <-{c.get('←')} {c.get('url')}")
    if c.get("body"): print("  resp:",c["body"][:900])
PY
