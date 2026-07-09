set +e
echo "=== /status PRIMA ==="
curl -s --max-time 8 http://127.0.0.1:4200/status 2>&1 | head -c 300; echo ""
echo "=== restart allianz-scraper ==="
sudo systemctl restart allianz-scraper.service 2>&1
echo "attendo ripresa :4200..."
for i in $(seq 1 30); do curl -s --max-time 3 http://127.0.0.1:4200/status >/dev/null 2>&1 && { echo "pronto dopo $((i*3))s"; break; }; sleep 3; done
sleep 5
echo "=== /status DOPO ==="
curl -s --max-time 10 http://127.0.0.1:4200/status 2>&1 | head -c 400; echo ""
echo "=== journal ultimissime righe (login/fast/duo) ==="
sudo journalctl -u allianz-scraper.service --no-pager -n 25 2>&1 | grep -iE 'login|fast|duo|matrix|error|apert|loggato' | tail -15
echo "---fine---"
