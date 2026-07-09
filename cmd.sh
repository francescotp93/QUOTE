set +e
echo "=== allianz-scraper stato ==="
systemctl is-active allianz-scraper.service; systemctl is-enabled allianz-scraper.service
echo "=== /status interno :4200 ==="
curl -s --max-time 8 http://127.0.0.1:4200/status 2>&1 | head -c 400
echo ""
echo "=== journalctl allianz (ultime 40, solo righe utili) ==="
sudo journalctl -u allianz-scraper.service --no-pager -n 120 2>&1 | grep -iE 'fast|quote|matrix|login|duo|error|scad|apert|premio|timeout' | tail -40
echo "---fine---"
