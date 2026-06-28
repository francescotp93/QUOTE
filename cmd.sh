echo "=== riavvio pulito axa-scraper ==="
sudo systemctl restart axa-scraper.service 2>&1; sleep 16
echo "  active: $(systemctl is-active axa-scraper.service)"
echo "=== status (browser su?) ==="
curl -s --max-time 12 http://127.0.0.1:4700/status 2>&1; echo
echo "=== /accedi (due passi -> Guardian) ==="
curl -s --max-time 120 -X POST http://127.0.0.1:4700/accedi 2>&1; echo
echo "=== log step ==="
journalctl -u axa-scraper.service --since "-3 min" --no-pager 2>/dev/null | grep -iE "AXA:|guardian|otp|loggato|attesa|err|X server" | tail -14
