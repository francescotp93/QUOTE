cd /opt/withus-backend
git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null
git reset --hard origin/claude/vibrant-tesla-o0glfd -q 2>/dev/null
sudo systemctl restart hdi-scraper.service 2>/dev/null
sleep 22
curl -s -m 30 "http://127.0.0.1:4400/status" 2>/dev/null; echo ""
curl -s -m 150 "http://127.0.0.1:4400/casaprobe" 2>/dev/null | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin)
  print('casaInit:', (d.get('casaInit') or {}).get('status'))
  cc=d.get('casaControlli') or {}; print('controlliDeroga.status:', cc.get('status'), 'err:', (cc.get('err') or '')[:150])
  cq=d.get('casaQuot') or {}
  print('casaQuot.status:', cq.get('status'), 'len:', cq.get('len'), 'err:', (cq.get('err') or '')[:150])
  print('PREMI:', cq.get('premi'))
except Exception as e: print('parse err', e)
"
echo "---fine---"
