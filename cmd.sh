
set +e
echo "== autopull(40s) + restart hdi =="
sleep 40
sudo systemctl restart hdi-scraper.service
# attendo readiness porta 4400
for i in $(seq 1 30); do curl -s --max-time 3 http://127.0.0.1:4400/status >/dev/null 2>&1 && { echo "pronto $i"; break; }; sleep 3; done
echo "== /premio HDI GJ572TC (sconto+pacchetto, debug) =="
timeout 200 curl -s --max-time 195 "http://127.0.0.1:4400/premio?targa=GJ572TC&nascita=1956-06-01&debug=1" 2>&1 | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
except Exception as e:
    print('non-json:', sys.stdin.read()[:600]); raise SystemExit
print('ok:', d.get('ok'))
print('premio:', d.get('premio_annuale') or d.get('premio'))
p=d.get('pacchetto') or {}
print('pacchetto:', json.dumps(p, ensure_ascii=False)[:600])
print('premioSrc:', d.get('premioSrc') or d.get('premio_src'))
if d.get('error'): print('error:', d['error'])
"
echo "---fine---"
