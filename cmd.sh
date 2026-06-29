echo "=== autopull: forzo un giro ora ==="
systemctl start withus-autopull.service 2>/dev/null || true
# attendo che l'autopull installi/avvii lo scraper (npm+playwright in background)
for i in $(seq 1 18); do
  if [ -f /etc/systemd/system/assieasy-scraper.service ]; then break; fi
  sleep 5
done
echo "unit presente: $([ -f /etc/systemd/system/assieasy-scraper.service ] && echo SI || echo NO)"
echo "=== stato servizio ==="
systemctl is-active assieasy-scraper 2>/dev/null
systemctl is-enabled assieasy-scraper 2>/dev/null
echo "=== ultime righe log ==="
journalctl -u assieasy-scraper --no-pager -n 15 2>/dev/null | tail -15
echo "=== probe /status (porta 4800) — attendo avvio nodo ==="
for i in $(seq 1 12); do
  R=$(curl -s --max-time 5 http://127.0.0.1:4800/status 2>/dev/null)
  if [ -n "$R" ]; then echo "$R"; break; fi
  sleep 5
done
