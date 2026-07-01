cd /opt/withus-backend
git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null
git reset --hard origin/claude/vibrant-tesla-o0glfd -q 2>/dev/null
ls -la scraper/hdi/casa-template.json 2>/dev/null | awk '{print "template:",$5,"byte"}'
sudo systemctl restart hdi-scraper.service 2>/dev/null
sleep 22
curl -s -m 30 "http://127.0.0.1:4400/status" 2>/dev/null; echo ""
curl -s -m 150 "http://127.0.0.1:4400/casaprobe" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('tplErr:', d.get('tplErr'))
tc=d.get('tplControlli') or {}; print('TEMPLATE controlliDeroga.status:', tc.get('status'), 'err:', (tc.get('err') or '')[:150])
tq=d.get('tplQuot') or {}
print('TEMPLATE quotazione.status:', tq.get('status'), 'len:', tq.get('len'), 'err:', (tq.get('err') or '')[:150])
print('TEMPLATE PREMI:', tq.get('premi'))
"
echo "---fine---"
