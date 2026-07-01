cd /opt/withus-backend
git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null
git reset --hard origin/claude/vibrant-tesla-o0glfd -q 2>/dev/null
echo "fastquote nella sonda:" $(grep -c "await fastquote('FL21345'" scraper/moto/quote-service.mjs)
sudo systemctl restart moto-scraper.service 2>/dev/null
sleep 20
echo "--- status ---"; curl -s -m 20 "http://127.0.0.1:4100/status" 2>/dev/null; echo ""
echo "=== apiprobe9 (fastquote+CDP) ==="
curl -s -m 175 "http://127.0.0.1:4100/apiprobe" 2>/dev/null
echo ""
