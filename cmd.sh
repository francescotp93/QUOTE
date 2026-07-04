set +e
echo "== autopull(40s)+restart hdi =="; sleep 40
sudo systemctl restart hdi-scraper.service 2>&1 | head -1
for i in $(seq 1 30); do echo "$(timeout 5 curl -s --max-time 4 http://127.0.0.1:4400/status 2>/dev/null)" | grep -q '"loggato":true' && { echo "pronto ${i}"; break; }; sleep 3; done
echo "== HDI pacchetto (disattiva garanzie) GY263BY =="; T0=$(date +%s)
timeout 170 curl -s --max-time 165 "http://127.0.0.1:4400/premio?targa=GY263BY&nascita=17/07/1993" 2>&1 > /tmp/hd.json
python3 -c "
import json
d=json.load(open('/tmp/hd.json'))
print('ok',d.get('ok'),'premio',d.get('premio_annuale'),'src',d.get('premio_src'))
p=d.get('pacchetto') or {}
print('disattivate:',p.get('disattivate'))
print('premio_pacchetto:',p.get('premio_pacchetto'))
print('garanzie_residue:',p.get('garanzie_residue'))
" 2>&1
echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
