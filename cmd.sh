set +e
echo "=== whoami / uptime ==="
whoami; uptime 2>&1 | head -1
echo "=== systemctl status hdi-scraper ==="
sudo systemctl status hdi-scraper.service --no-pager -l 2>&1 | tail -16
echo "=== journalctl hdi-scraper (ultime 45) ==="
sudo journalctl -u hdi-scraper.service --no-pager -n 45 2>&1 | tail -45
echo "=== reset-failed + restart ==="
sudo systemctl reset-failed hdi-scraper.service 2>&1
sudo systemctl restart hdi-scraper.service 2>&1
echo "restart lanciato, attendo /status su :4400..."
UP=0
for i in $(seq 1 28); do
  if curl -s --max-time 3 http://127.0.0.1:4400/status >/dev/null 2>&1; then echo "HDI :4400 PRONTO dopo $((i*3))s"; UP=1; break; fi
  sleep 3
done
[ "$UP" = "0" ] && echo "HDI :4400 ANCORA GIU dopo ~84s"
echo "=== tunnel 4401 attivo? ==="
sudo systemctl is-active hdi-tunnel.service 2>&1
echo "=== /status finale :4400 ==="
curl -s --max-time 5 http://127.0.0.1:4400/status 2>&1 | head -c 500
echo ""
echo "---fine---"
