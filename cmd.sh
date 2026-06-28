echo "=== axa-scraper attivo? ==="
systemctl is-active axa-scraper.service
echo "=== /status (2 tentativi) ==="
for i in 1 2; do curl -s --max-time 10 http://127.0.0.1:4700/status 2>/dev/null | head -c 150; echo; sleep 4; done
echo "=== il fix velocita' e' nel file? (no gotoCloudflare in doAccedi) ==="
grep -c "AXA NON è dietro Cloudflare: navigazione semplice" /opt/withus-backend/scraper/axa/quote-service.mjs 2>/dev/null
