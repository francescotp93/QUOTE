cd /opt/withus-backend
git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null
git reset --hard origin/claude/vibrant-tesla-o0glfd -q 2>/dev/null
echo "nodecode presente:" $(grep -c "nodecode" scraper/hdi/quote-service.mjs)
sudo systemctl restart hdi-scraper.service 2>/dev/null
sleep 22
curl -s -m 120 "http://127.0.0.1:4400/casaprobe" 2>/dev/null | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin)
  print('hasToken:', d.get('hasToken'))
  print('prodotti:', d.get('prodotti'))
  print('casaInit:', d.get('casaInit'))
except Exception as e: print('parse err', e, sys.stdin.read()[:200])
" 2>/dev/null || echo "(probe vuoto)"
