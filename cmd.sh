set -u
for S in groupama prima; do
  echo "=== $S-scraper: stato + ultime righe log ==="
  systemctl is-active $S-scraper 2>/dev/null
  journalctl -u $S-scraper --no-pager -n 18 2>/dev/null | tail -18
  echo "-------------------------------"
done
