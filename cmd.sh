B=http://127.0.0.1:4100
echo "=== 24H /lookup FA85248 (cosa mostra la pagina dopo il fastquote) ==="
curl -s -m 150 "$B/lookup?targa=FA85248&nascita=19/05/1995" > /tmp/lk.json
python3 - <<'PY'
import json
try: d=json.load(open('/tmp/lk.json'))
except Exception as e: print('ERR',e,open('/tmp/lk.json').read()[:300]); raise SystemExit
print("veicolo:",json.dumps(d.get("veicolo"),ensure_ascii=False)[:200])
print("--- _text (pagina) ---")
print((d.get("_text") or "")[:1400])
print("--- controlli rilevanti ---")
for c in (d.get("_dump",{}).get("ctrls") or [])[:25]:
  if c.get("id") or (c.get("text") and len(c.get("text"))>1): print("  ",c.get("tag"),"id=",c.get("id"),"type=",c.get("type"),"txt=",(c.get("text") or "")[:40])
PY
