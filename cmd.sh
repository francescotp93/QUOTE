set +e
echo "== autopull(40s)+restart hdi =="; sleep 40
sudo systemctl restart hdi-scraper.service 2>&1 | head -1
for i in $(seq 1 30); do echo "$(timeout 5 curl -s --max-time 4 http://127.0.0.1:4400/status 2>/dev/null)" | grep -q '"loggato":true' && { echo "pronto ${i}"; break; }; sleep 3; done
echo "== HDI /premio GY263BY (pacchetto rilevato) =="; T0=$(date +%s)
timeout 150 curl -s --max-time 145 "http://127.0.0.1:4400/premio?targa=GY263BY&nascita=17/07/1993" 2>&1 > /tmp/hf.json
python3 -c "
import json
d=json.load(open('/tmp/hf.json'))
print('ok',d.get('ok'),'premio',d.get('premio_annuale'),'src',d.get('premio_src'))
print('pacchetto:',json.dumps(d.get('pacchetto'),ensure_ascii=False))
" 2>&1
echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
