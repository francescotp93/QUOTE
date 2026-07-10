set +e
# attendo che l'autopull porti la fix e lo scraper riparta
for i in $(seq 1 22); do
  grep -q 'forzo autoLogin' /opt/withus-backend/scraper/allianz/quote-service.mjs 2>/dev/null && curl -s --max-time 3 http://127.0.0.1:4200/status >/dev/null 2>&1 && { echo "scraper pronto con la fix (dopo ~$((i*6))s)"; break; }
  sleep 6
done
echo -n "fix sul disco: "; grep -c 'forzo autoLogin' /opt/withus-backend/scraper/allianz/quote-service.mjs
echo "=== /premio Allianz targa=GY263BY (deve aprire il fast-quote dopo il relogin) ==="
timeout 210 curl -s --max-time 205 "http://127.0.0.1:4200/premio?targa=GY263BY&nascita=17/07/1993&tipo=auto" > /tmp/alz.json 2>&1
echo "dim: $(wc -c < /tmp/alz.json) byte"
python3 - <<'PY'
import json
try: d=json.load(open('/tmp/alz.json'))
except Exception as e: print('NON-JSON:', open('/tmp/alz.json').read()[:400]); raise SystemExit
for k in ('ok','premio_annuale','error','pacchetto','classe_cu'):
    if k in d: print(k,'=', d[k])
PY
echo "=== /status finale ==="
curl -s --max-time 8 http://127.0.0.1:4200/status; echo
echo "---fine---"
