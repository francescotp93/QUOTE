
set +e
echo "== autopull(40s) =="
sleep 40
echo "== drop-in HDI_LOCK_MS=240000 (solo per questo test) =="
sudo mkdir -p /etc/systemd/system/hdi-scraper.service.d
printf '[Service]\nEnvironment=HDI_LOCK_MS=240000\n' | sudo tee /etc/systemd/system/hdi-scraper.service.d/locktest.conf >/dev/null
sudo systemctl daemon-reload
sudo systemctl restart hdi-scraper.service
for i in $(seq 1 30); do curl -s --max-time 3 http://127.0.0.1:4400/status >/dev/null 2>&1 && { echo "pronto $i"; break; }; sleep 3; done
sleep 3
echo "== /premio HDI CS228ZE (lock 240s, sconto+pacchetto) =="
timeout 270 curl -s --max-time 265 "http://127.0.0.1:4400/premio?targa=CS228ZE&debug=1" 2>&1 | python3 -c "
import sys,json
raw=sys.stdin.read()
try: d=json.loads(raw)
except Exception:
    print('non-json:', raw[:800]); raise SystemExit
print('ok:', d.get('ok'))
print('premio:', d.get('premio_annuale') or d.get('premio'))
print('premioSrc:', d.get('premioSrc') or d.get('premio_src'))
p=d.get('pacchetto') or {}
print('pacchetto:', json.dumps(p, ensure_ascii=False)[:800])
if d.get('error'): print('error:', d['error'])
"
echo "== rimuovo drop-in e torno a 135s =="
sudo rm -f /etc/systemd/system/hdi-scraper.service.d/locktest.conf
sudo systemctl daemon-reload
sudo systemctl restart hdi-scraper.service
echo "---fine---"
