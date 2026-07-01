cd /opt/withus-backend
git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null
git reset --hard origin/claude/vibrant-tesla-o0glfd -q 2>/dev/null
sudo systemctl restart moto-scraper.service 2>/dev/null
sleep 20
echo "status:"; curl -s -m 20 "http://127.0.0.1:4100/status" 2>/dev/null; echo ""
curl -s -m 175 "http://127.0.0.1:4100/apiprobe" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('hasToken:', d.get('hasToken'), 'tplBytes:', d.get('tplBytes'))
s=d.get('steps',{})
print('search:', s.get('search'),'new:', s.get('new'),'getdetail:',s.get('getdetail'))
print('setmp:', s.get('setmp'))
print('bestGrossPrice:', d.get('bestGrossPrice'),'priceItems:', d.get('priceItems'),'premi:', d.get('premi'))
print('setmp_raw:', (d.get('setmp_raw') or '')[:250])
"
echo "---fine---"
