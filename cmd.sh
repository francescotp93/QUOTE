cd /opt/withus-backend
git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null
git reset --hard origin/claude/vibrant-tesla-o0glfd -q 2>/dev/null
echo "mapping presente:" $(grep -c "costruisco il corpo" scraper/hdi/quote-service.mjs)
sudo systemctl restart hdi-scraper.service 2>/dev/null
sleep 22
echo "--- status ---"; curl -s -m 20 "http://127.0.0.1:4400/status" 2>/dev/null; echo ""
echo "=== casaprobe (catena completa) ==="
curl -s -m 150 "http://127.0.0.1:4400/casaprobe" 2>/dev/null | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin)
  print('hasToken:', d.get('hasToken'), 'prodotti:', (d.get('prodotti') or {}).get('status'))
  ci=d.get('casaInit') or {}; print('casaInit.status:', ci.get('status'))
  cq=d.get('casaQuot') or {}
  print('casaQuot.status:', cq.get('status'), 'len:', cq.get('len'))
  print('casaQuot.err:', cq.get('err'))
  print('casaQuot.premi:', cq.get('premi'))
except Exception as e: print('parse err', e)
"
echo "---fine---"
