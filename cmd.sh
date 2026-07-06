
set +e
echo "== /premio HDI CS228ZE (sconto+pacchetto, debug) — servizio gia' caldo =="
timeout 200 curl -s --max-time 195 "http://127.0.0.1:4400/premio?targa=CS228ZE&debug=1" 2>&1 | python3 -c "
import sys,json
raw=sys.stdin.read()
try: d=json.loads(raw)
except Exception:
    print('non-json:', raw[:800]); raise SystemExit
print('ok:', d.get('ok'))
print('premio:', d.get('premio_annuale') or d.get('premio'))
print('premioSrc:', d.get('premioSrc') or d.get('premio_src'))
p=d.get('pacchetto') or {}
print('pacchetto:', json.dumps(p, ensure_ascii=False)[:700])
if d.get('error'): print('error:', d['error'])
"
echo "---fine---"
