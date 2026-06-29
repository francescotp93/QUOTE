echo "=== HDI scraper: ultimi log rilevanti ==="
journalctl -u hdi-scraper.service --no-pager -n 400 2>/dev/null | grep -iE "targa|QUOTA|nascita|nodo|premio|fast|emiss|err|home" | tail -45
echo "=== HDI /status ==="
curl -s --max-time 12 http://127.0.0.1:4400/status 2>/dev/null | head -c 400
