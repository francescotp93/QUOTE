echo "=== GROUPAMA: tutto il giornale di stamattina (il login ha retto meno di un'ora)"
journalctl -u groupama-scraper --since '2026-09-12 07:40' --no-pager 2>/dev/null | tail -60 | cut -c1-200
echo
echo "=== AXA: il tentativo di login di stamattina, per esteso"
journalctl -u axa-scraper --since '2026-09-12 07:40' --until '2026-09-12 08:10' --no-pager 2>/dev/null | tail -40 | cut -c1-200
