echo "=== riavvio pulito prima-scraper (stealth) ==="
sudo systemctl restart prima-scraper.service 2>&1; sleep 14
echo "  ActiveEnter: $(systemctl show prima-scraper.service -p ActiveEnterTimestamp --value 2>/dev/null)"
echo "  active: $(systemctl is-active prima-scraper.service)"
echo "=== log avvio (errori?) ==="
journalctl -u prima-scraper.service --since "-2 min" --no-pager 2>/dev/null | tail -12
echo "=== /status ==="
curl -s --max-time 10 http://127.0.0.1:4600/status 2>&1; echo
echo "=== Cloudflare ancora? (apro login Prima con stealth) ==="
curl -s --max-time 50 "http://127.0.0.1:4600/explore?goto=https://intermediari.prima.it/login" 2>&1 | grep -iE "\"url\"|\"text\"" | head -2 | cut -c1-260
