
set +e
printf '[Service]\nEnvironment=HDI_LOCK_MS=240000\n' | sudo tee /etc/systemd/system/hdi-scraper.service.d/locktest.conf >/dev/null
sudo systemctl daemon-reload; sudo systemctl restart hdi-scraper.service
for i in $(seq 1 30); do curl -s --max-time 3 http://127.0.0.1:4400/status >/dev/null 2>&1 && { echo "pronto $i"; break; }; sleep 3; done
sleep 3
echo "== /premio HDI CS228ZE FULL DUMP =="
timeout 270 curl -s --max-time 265 "http://127.0.0.1:4400/premio?targa=CS228ZE&debug=1" 2>&1 | python3 -c "
import sys,json
raw=sys.stdin.read()
try: d=json.loads(raw)
except Exception:
    print('non-json len',len(raw),':', raw[:1500]); raise SystemExit
print('TOP KEYS:', list(d.keys()))
for k in ('ok','error','premio','premio_annuale','premioSrc','premio_src','premioKey','via','step','msg','note','diag'):
    if k in d: print(k,'=', json.dumps(d[k], ensure_ascii=False)[:300])
p=d.get('pacchetto'); print('pacchetto=', json.dumps(p, ensure_ascii=False)[:500] if p is not None else 'ASSENTE')
# stampa eventuali campi che contengono 'err' o 'block' o 'sivi'
for k,v in d.items():
    if isinstance(v,str) and any(w in v.lower() for w in ['error','blocc','sivi','npe','fail','non ','timeout','scad']):
        print('~',k,'=',v[:200])
"
sudo rm -f /etc/systemd/system/hdi-scraper.service.d/locktest.conf
sudo systemctl daemon-reload; sudo systemctl restart hdi-scraper.service
echo "---fine---"
