echo "=== /accedi (con ricorda 30gg dovrebbe NON chiedere Guardian) ==="
curl -s --max-time 160 -X POST http://127.0.0.1:4700/accedi 2>&1 | head -c 300; echo
echo "=== status ==="
curl -s --max-time 12 http://127.0.0.1:4700/status 2>&1 | cut -c1-160; echo
echo "=== log ==="
journalctl -u axa-scraper.service --since "-4 min" --no-pager 2>/dev/null | grep -iE "AXA:|guardian|loggato|attesa|otp|err" | tail -10
