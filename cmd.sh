set +e
echo "=== journal axa-scraper ultime 60 righe ==="
sudo journalctl -u axa-scraper.service --no-pager -n 80 2>&1 | tail -55
echo "---fine---"
