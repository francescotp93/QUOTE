set +e
echo "=== /premio Allianz GY263BY (scraper gia' caldo con la fix) ==="
timeout 235 curl -s --max-time 230 "http://127.0.0.1:4200/premio?targa=GY263BY&nascita=17/07/1993&tipo=auto" > /tmp/alz.json 2>&1
RC=$?
echo "curl rc=$RC · dim: $(wc -c < /tmp/alz.json) byte"
python3 - <<'PY'
import json
try: d=json.load(open('/tmp/alz.json'))
except Exception as e: print('NON-JSON:', open('/tmp/alz.json').read()[:500]); raise SystemExit
for k in ('ok','premio_annuale','error','pacchetto','classe_cu','decorrenza'):
    if k in d: print(k,'=', d[k])
PY
echo "---fine---"
