cd /opt/withus-backend 2>/dev/null
for i in $(seq 1 30); do git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null; L=$(git rev-parse HEAD|cut -c1-7); [ "$L" = "53039d0" ] && { echo "autopull ok"; break; }; sleep 6; done
sleep 12
echo "=== /accedi (due passi -> Guardian) ==="
curl -s --max-time 120 -X POST http://127.0.0.1:4700/accedi 2>&1; echo
echo "=== dove e' ora ==="
curl -s --max-time 12 http://127.0.0.1:4700/logindump 2>&1 | head -c 500; echo
echo "=== log step ==="
journalctl -u axa-scraper.service --since "-4 min" --no-pager 2>/dev/null | grep -iE "AXA:|guardian|otp|loggato|attesa" | tail -12
