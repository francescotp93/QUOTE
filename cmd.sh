cd /opt/withus-backend 2>/dev/null
echo "=== attendo autopull 88ced83 ==="
for i in $(seq 1 30); do git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null; L=$(git rev-parse HEAD|cut -c1-7); [ "$L" = "88ced83" ] && { echo "ok"; break; }; sleep 4; done
sudo systemctl restart groupama-scraper.service 2>&1; sleep 12
echo "=== hover Applicazioni + tutti i link (cerco ISA) ==="
curl -s --max-time 45 "http://127.0.0.1:4500/explore?hover=Applicazioni&all=1" 2>&1 | grep -iE "isa|applicaz|href|\"t\":" | head -60
