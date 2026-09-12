echo "ora: $(date '+%F %T %Z')"
echo "=== AXA: stato completo (dove si trova il browser adesso)"
curl -s -m 20 http://127.0.0.1:4700/status | head -c 600
echo; echo
echo "=== AXA: giornale dal codice inserito in poi"
journalctl -u axa-scraper --since '2026-09-12 11:49:30' --no-pager 2>/dev/null | tail -20 | cut -c1-190
echo
echo "=== GROUPAMA: seconda lettura (la prima era andata in timeout)"
curl -s -m 25 http://127.0.0.1:4500/status | head -c 400
