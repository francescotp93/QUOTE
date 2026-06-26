cd /opt/withus-backend
for i in $(seq 1 30); do h=$(git rev-parse --short HEAD 2>/dev/null); [ "$h" = "baf825a" ] && { echo "deploy baf825a giro $i"; break; }; sleep 5; done
B=http://127.0.0.1:4100
for i in $(seq 1 25); do curl -s -m 6 "$B/status" >/dev/null 2>&1 && { echo "up giro $i"; break; }; sleep 3; done
sleep 3
echo "=== /flowmap FA85248 ==="
curl -s -m 180 "$B/flowmap?targa=FA85248&nascita=19/05/1995" > /tmp/fm.json
python3 - <<'PY'
import json
try: d=json.load(open('/tmp/fm.json'))
except Exception as e: print('ERR',e,open('/tmp/fm.json').read()[:300]); raise SystemExit
for i,s in enumerate(d.get("seq") or []):
  print(f"--- STEP {i} (url ...{s.get('url')}) clicked={s.get('clicked')} ---")
  print("  heads:",s.get("heads"))
  print("  selects:",[ (x.get('id'),x.get('opts')) for x in (s.get('selects') or [])])
  print("  inputs:",[ (x.get('id'),x.get('type'),x.get('ph')) for x in (s.get('inputs') or [])][:8])
  print("  btns:",s.get("btns"))
  print("  prezzi:",s.get("prezzi"))
PY
