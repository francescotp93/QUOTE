set +e
echo "== git head prod =="; cd /opt/withus-backend 2>/dev/null && git log --oneline -1 2>&1; cd - >/dev/null
echo "== systemctl status hdi-scraper =="; sudo systemctl status hdi-scraper.service --no-pager -l 2>&1 | head -12
echo "== port 4400 health =="; timeout 8 curl -s --max-time 6 "http://127.0.0.1:4400/health" 2>&1 | head -c 200; echo ""
echo "== last 25 journal lines =="; sudo journalctl -u hdi-scraper.service -n 25 --no-pager 2>&1 | tail -25
echo "---fine---"
