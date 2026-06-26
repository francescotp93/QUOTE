cd /opt/withus-backend
for i in $(seq 1 24); do h=$(git rev-parse --short HEAD); [ "$h" = "7c8ee88" ] && break; sleep 5; done
systemctl restart moto-scraper 2>/dev/null; sleep 2
B=http://127.0.0.1:4100
for i in $(seq 1 25); do curl -s -m 6 "$B/status" >/dev/null 2>&1 && { echo "moto up giro $i"; break; }; sleep 4; done
sleep 4
echo "=== /flowmap FA85248 comune=Trapani ==="
curl -s -m 200 "$B/flowmap?targa=FA85248&nascita=19/05/1995&comune=TRAPANI" > /tmp/fm.json
python3 - <<'PY'
import json
try: d=json.load(open('/tmp/fm.json'))
except Exception as e: print('ERR',e,open('/tmp/fm.json').read()[:300]); raise SystemExit
seq=d.get("seq") or []
print("steps:",len(seq))
for i,s in enumerate(seq):
  print(f"--- STEP {i} (...{s.get('url')}) allest={s.get('allestimento')} comune={s.get('comune')} clicked={s.get('clicked')} prezzi={s.get('prezzi')} ---")
  print("  inputs:",[ (x.get('id'),x.get('type'),x.get('ph')) for x in (s.get('inputs') or [])][:8])
  bt=s.get("btns") or []
  print("  btns:",[b for b in bt if b.upper() in ('PROSEGUI','CONTINUA','AVANTI','CONFERMA','CALCOLA','MODIFICA','PREVENTIVO','ACQUISTA','PROCEDI') or '€' in b])
  if i==len(seq)-1: print("  txt:",(s.get('txt') or '')[:400])
PY
