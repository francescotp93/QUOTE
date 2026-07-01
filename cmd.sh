cd /opt/withus-backend
git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null
git reset --hard origin/claude/vibrant-tesla-o0glfd -q 2>/dev/null
echo "form trigger presente:" $(grep -c "cta_mp_fastquote_1" scraper/moto/quote-service.mjs)
sudo systemctl restart moto-scraper.service 2>/dev/null
sleep 18
echo "=== apiprobe5 ==="
curl -s -m 150 "http://127.0.0.1:4100/apiprobe" 2>/dev/null
echo ""
