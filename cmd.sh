set +e
# attendo che l'autopull porti il codice moto e lo scraper sia pronto
for i in $(seq 1 22); do
  grep -q 'HDI_MOTOR_PRODS' /opt/withus-backend/scraper/hdi/quote-service.mjs 2>/dev/null && curl -s --max-time 3 http://127.0.0.1:4400/status >/dev/null 2>&1 && { echo "scraper pronto col codice moto (dopo ~$((i*6))s)"; break; }
  sleep 6
done
echo -n "HDI_MOTOR_PRODS sul disco: "; grep -c 'HDI_MOTOR_PRODS' /opt/withus-backend/scraper/hdi/quote-service.mjs
echo "=== TEST MOTO: /premio-motor targa=FW98995 nascita=06/03/1999 linea=moto ==="
timeout 140 curl -s --max-time 138 "http://127.0.0.1:4400/premio-motor?targa=FW98995&nascita=06/03/1999&linea=moto&prov=TP&comune=ERICE&debug=1" > /tmp/moto.json 2>&1
echo "dim: $(wc -c < /tmp/moto.json) byte"
python3 - <<'PY'
import json
try: d=json.load(open('/tmp/moto.json'))
except Exception as e:
    print('NON-JSON:', open('/tmp/moto.json').read()[:500]); raise SystemExit
for k in ('ok','premio_annuale','premio_annuale_num','compagnia','error','_fallback','_sessione'):
    if k in d: print(k,'=',d[k])
found={}
def walk(dd):
    if isinstance(dd,dict):
        for k,val in dd.items():
            if k.lower() in ('marca','modello','descrizionemodello','cilindrata','descrizioneallestimento') and isinstance(val,(str,int)) and str(val).strip():
                found[k]=val
            walk(val)
    elif isinstance(dd,list):
        for x in dd: walk(x)
walk(d)
if found: print('VEICOLO RISOLTO:', found)
else: print('veicolo NON risolto (nessun marca/modello nella risposta)')
PY
echo "---fine---"
