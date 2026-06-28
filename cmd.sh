echo "=== PRIMA /status ==="
curl -s --max-time 10 http://127.0.0.1:4600/status 2>&1; echo
echo "=== GROUPAMA /status ==="
curl -s --max-time 10 http://127.0.0.1:4500/status 2>&1; echo
echo "=== PRIMA log ultimi 5 min ==="
journalctl -u prima-scraper.service --since "-5 min" --no-pager 2>/dev/null | grep -iE "fill user|2FA|schermata|TOTP|codice|loggato|invio|accedi" | tail -12
