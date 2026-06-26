cd /opt/withus-backend
for i in $(seq 1 24); do h=$(git rev-parse --short HEAD); [ "$h" = "a73fd8e" ] && break; sleep 5; done
systemctl restart moto-scraper 2>/dev/null; sleep 2
B=http://127.0.0.1:4100
for i in $(seq 1 25); do curl -s -m 6 "$B/status" >/dev/null 2>&1 && { echo "moto up giro $i"; break; }; sleep 4; done
sleep 4
echo "=== /flowmap FA85248 (con allestimento) ==="
curl -s -m 180 "$B/flowmap?targa=FA85248&nascita=19/05/1995" > /tmp/fm.json
python3 - <<'PY'
import json
try: d=json.load(open('/tmp/fm.json'))
except Exception as e: print('ERR',e,open('/tmp/fm.json').read()[:300]); raise SystemExit
seq=d.get("seq") or []
print("steps:",len(seq))
for i,s in enumerate(seq):
  print(f"--- STEP {i} (...{s.get('url')}) allest={s.get('allestimento')} clicked={s.get('clicked')} prezzi={s.get('prezzi')} ---")
  print("  heads:",s.get("heads"))
  print("  inputs:",[ (x.get('id'),x.get('type'),x.get('ph'),x.get('val')) for x in (s.get('inputs') or [])][:8])
  bt=s.get("btns") or []
  print("  btns(rilev):",[b for b in bt if b.upper() in ('PROSEGUI','CONTINUA','AVANTI','CONFERMA','CALCOLA','MODIFICA') or '€' in b])
PY
