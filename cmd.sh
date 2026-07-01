cd /opt/withus-backend
git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null
git reset --hard origin/claude/vibrant-tesla-o0glfd -q 2>/dev/null
echo "CDP presente:" $(grep -c "requestWillBeSentExtraInfo" scraper/moto/quote-service.mjs)
sudo systemctl restart moto-scraper.service 2>/dev/null
sleep 18
echo "=== apiprobe8 (CDP) ==="
curl -s -m 160 "http://127.0.0.1:4100/apiprobe" 2>/dev/null
echo ""
