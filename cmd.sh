cd /opt/withus-backend 2>/dev/null
for i in $(seq 1 30); do git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null; L=$(git rev-parse HEAD|cut -c1-7); [ "$L" = "9e22918" ] && { echo "autopull ok"; break; }; sleep 4; done
sudo systemctl restart groupama-scraper.service 2>&1; sleep 13
echo "=== /premio?targa=GY263BY ==="
curl -s --max-time 130 "http://127.0.0.1:4500/premio?targa=GY263BY" 2>&1; echo
echo "=== log nav ISA ==="
journalctl -u groupama-scraper.service --since "-3 min" --no-pager 2>/dev/null | grep -iE "ISA nav|clickTrattativa|input targa" | tail -10
