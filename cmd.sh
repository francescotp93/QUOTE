echo "=== HDI tunnel ==="
systemctl is-active hdi-tunnel 2>/dev/null
echo "HDI via tunnel (4401):"; curl -s --max-time 12 http://127.0.0.1:4401/status 2>/dev/null | head -c 300; echo
grep '^HDI_SCRAPER_URL=' /opt/withus-backend/.env 2>/dev/null || grep -r '^HDI_SCRAPER_URL=' /opt/withus-backend/server/.env 2>/dev/null || echo "HDI_SCRAPER_URL non in .env"
echo "=== 24H scraper (4100) ==="
systemctl is-active moto-scraper 2>/dev/null
curl -s --max-time 10 http://127.0.0.1:4100/status 2>/dev/null | head -c 300; echo
echo "=== Groupama scraper (4500) ==="
systemctl is-active groupama-scraper 2>/dev/null
curl -s --max-time 10 http://127.0.0.1:4500/status 2>/dev/null | head -c 300; echo
echo "=== AXA scraper (4700) ==="
curl -s --max-time 10 http://127.0.0.1:4700/status 2>/dev/null | head -c 300; echo
