cd /opt/withus-backend
echo "deploy HEAD moto: $(git log --oneline -1 -- scraper/moto/quote-service.mjs)"
echo "=== restart moto-scraper ==="
systemctl restart moto-scraper 2>/dev/null && echo "riavviato"
B=http://127.0.0.1:4100
for i in $(seq 1 30); do curl -s -m 6 "$B/status" >/dev/null 2>&1 && { echo "up giro $i"; break; }; sleep 4; done
sleep 5
echo "check /flowmap presente: $(curl -s -m 8 "$B/flowmap" | head -c 80)"
echo "=== /flowmap FA85248 ==="
curl -s -m 180 "$B/flowmap?targa=FA85248&nascita=19/05/1995" > /tmp/fm.json
python3 - <<'PY'
import json
try: d=json.load(open('/tmp/fm.json'))
except Exception as e: print('ERR',e,open('/tmp/fm.json').read()[:300]); raise SystemExit
seq=d.get("seq") or []
print("steps:",len(seq))
for i,s in enumerate(seq):
  print(f"--- STEP {i} (...{s.get('url')}) clicked={s.get('clicked')} prezzi={s.get('prezzi')} ---")
  print("  heads:",s.get("heads"))
  print("  selects:",[ (x.get('id'),x.get('val'),x.get('opts')) for x in (s.get('selects') or [])][:5])
  print("  inputs:",[ (x.get('id'),x.get('type'),x.get('ph')) for x in (s.get('inputs') or [])][:8])
  print("  btns:",s.get("btns"))
PY
