echo "active: $(systemctl is-active axa-scraper.service)"
echo "fix presente: $(grep -c 'navigo al portale' /opt/withus-backend/scraper/axa/quote-service.mjs 2>/dev/null)"
echo "status:"; curl -s --max-time 25 http://127.0.0.1:4700/status 2>/dev/null | head -c 160
