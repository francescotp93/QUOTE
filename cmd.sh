cd /opt/withus-backend
git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null
git reset --hard origin/claude/vibrant-tesla-o0glfd -q 2>/dev/null
sudo systemctl restart hdi-scraper.service 2>/dev/null
sleep 22
curl -s -m 150 "http://127.0.0.1:4400/casaprobe" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('tplBytes:', d.get('tplBytes'), 'tplErr:', d.get('tplErr'))
tc=d.get('tplControlli') or {}; print('controlliDeroga:', {k:tc.get(k) for k in ('status','error')}, 'err:', (tc.get('err') or '')[:120])
tq=d.get('tplQuot') or {}; print('quotazione:', {k:tq.get(k) for k in ('status','error','len')}, 'err:', (tq.get('err') or '')[:120])
print('PREMI:', tq.get('premi'))
"
echo "---fine---"
