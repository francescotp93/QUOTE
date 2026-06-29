echo "=== HDI log grezzi dalle 07:01 (tentativo fallito) ==="
journalctl -u hdi-scraper.service --no-pager --since "07:01:00" --until "07:05:30" 2>/dev/null | sed -E 's/^.*\[hdi\] //' | tail -60
