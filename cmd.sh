cd /opt/withus-backend
if ! grep -q "casaprobe" scraper/hdi/quote-service.mjs 2>/dev/null; then
  git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null
  git reset --hard origin/claude/vibrant-tesla-o0glfd -q 2>/dev/null
fi
echo "casaprobe presente:" $(grep -c casaprobe scraper/hdi/quote-service.mjs)
sudo systemctl restart hdi-scraper.service 2>/dev/null
sleep 10
echo "--- status HDI ---"
curl -s -m 20 "http://127.0.0.1:4400/status"
echo ""
echo "--- casaprobe ---"
curl -s -m 120 "http://127.0.0.1:4400/casaprobe"
