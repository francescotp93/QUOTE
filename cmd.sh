cd /opt/withus-backend
git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null
git reset --hard origin/claude/vibrant-tesla-o0glfd -q 2>/dev/null
echo "premi() presente:" $(grep -c "const premi =" scraper/groupama/quote-service.mjs)
sudo systemctl restart groupama-scraper.service 2>/dev/null
sleep 16
for i in $(seq 1 8); do s=$(curl -s -m 15 "http://127.0.0.1:4500/status" 2>/dev/null); echo "$s" | grep -q '"loggato":true' && { echo "LOGGATO ($i)"; break; }; echo "(attendo $i)"; sleep 6; done
echo "=== miiprobe3 ==="
curl -s -m 190 "http://127.0.0.1:4500/miiprobe?targa=GY263BY" 2>/dev/null
echo ""
