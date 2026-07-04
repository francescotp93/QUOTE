set +e
echo "== autopull(40s)+restart groupama =="; sleep 40
sudo systemctl restart groupama-scraper.service 2>&1 | head -1; sleep 8
for i in $(seq 1 25); do echo "$(timeout 5 curl -s --max-time 4 http://127.0.0.1:4500/status 2>/dev/null)" | grep -q '"loggato":true' && { echo "pronto ${i}"; break; }; sleep 3; done
echo "== miiprobe fattori INF05 GY263BY =="; T0=$(date +%s)
timeout 160 curl -s --max-time 155 "http://127.0.0.1:4500/miiprobe?targa=GY263BY" 2>&1 > /tmp/gf.json
python3 -c "
import json
d=json.load(open('/tmp/gf.json'))
p=d.get('probe') or {}
print('base',d.get('premio_base'),'| sez1',p.get('sez1'))
print('selUnitCodes:',p.get('selUnitCodes'))
print('selUnitFattori:',p.get('selUnitFattori'))
print('--- selRaw (1200) ---'); print((p.get('selRaw') or '')[:1200])
" 2>&1 | head -50
echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
