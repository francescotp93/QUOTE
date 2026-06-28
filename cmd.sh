cd /opt/withus-backend 2>/dev/null
echo "=== attendo autopull b682594 + restart automatico ==="
for i in $(seq 1 30); do git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null; L=$(git rev-parse HEAD|cut -c1-7); [ "$L" = "b682594" ] && { echo "ok"; break; }; sleep 6; done
# attendo che il restart automatico finisca e lo scraper risponda
for i in $(seq 1 12); do S=$(curl -s --max-time 8 http://127.0.0.1:4700/status 2>/dev/null); [ -n "$S" ] && { echo "scraper su"; break; }; sleep 5; done
echo "=== /accedi ==="
curl -s --max-time 110 -X POST http://127.0.0.1:4700/accedi 2>&1; echo
echo "=== pagina ora ==="
curl -s --max-time 15 http://127.0.0.1:4700/logindump 2>&1 | head -c 550; echo
echo "=== log step ==="
journalctl -u axa-scraper.service --since "-3 min" --no-pager 2>/dev/null | grep -iE "AXA:|guardian|otp|attesa|loggato|err" | tail -12
