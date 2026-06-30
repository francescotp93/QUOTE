echo "=== git HEAD backend ==="
git -C /opt/withus-backend log --oneline -1 2>/dev/null
echo "=== allianz-scraper service ==="
systemctl is-active allianz-scraper.service 2>/dev/null
echo "=== sniff endpoint check ==="
curl -s -m 8 "http://127.0.0.1:4200/sniff/start" 2>/dev/null | head -c 300
echo ""
echo "=== noise filter present? ==="
grep -c "SNIFF_NOISE" /opt/withus-backend/scraper/allianz/quote-service.mjs 2>/dev/null
