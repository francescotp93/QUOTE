echo "=== attendo autopull del fix groupama (commit 183aac0) ==="
cd /opt/withus-backend 2>/dev/null || cd /opt/quoto-backend 2>/dev/null || cd /opt/*backend* 2>/dev/null
for i in $(seq 1 30); do
  git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null
  H=$(git rev-parse origin/claude/vibrant-tesla-o0glfd 2>/dev/null | cut -c1-7)
  L=$(git rev-parse HEAD 2>/dev/null | cut -c1-7)
  echo "  tentativo $i: local=$L origin=$H"
  [ "$L" = "183aac0" ] && { echo "fix presente in HEAD locale"; break; }
  sleep 4
done
echo "=== verifica sintassi del modulo groupama ==="
node --check scraper/groupama/quote-service.mjs 2>&1 && echo "SINTASSI OK" || echo "SINTASSI KO"
echo "=== stato groupama (reachable?) ==="
curl -s --max-time 8 http://127.0.0.1:4500/status 2>&1; echo
echo "=== ultimi log groupama ==="
journalctl -u '*groupama*' -n 15 --no-pager 2>/dev/null | tail -15 || pm2 logs groupama --lines 15 --nostream 2>/dev/null | tail -15
