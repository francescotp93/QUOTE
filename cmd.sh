echo "=== service status ==="
systemctl is-active italiana-scraper; systemctl show italiana-scraper -p ActiveEnterTimestamp -p NRestarts -p ExecMainPID 2>/dev/null
echo "=== quante istanze del processo scraper ==="
pgrep -af 'quote-service.mjs' | head
echo "=== display / xvfb ==="
pgrep -af 'Xvfb|:97' | head -3
echo "=== ultimi 40 log del servizio ==="
journalctl -u italiana-scraper -n 40 --no-pager 2>/dev/null | tail -40
