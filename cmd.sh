echo "=== riavvio groupama-scraper per caricare il nuovo codice ==="
sudo systemctl restart groupama-scraper.service 2>&1 || systemctl restart groupama-scraper.service 2>&1 || sudo systemctl restart '*groupama*' 2>&1
echo "restart inviato, attendo boot…"
for i in $(seq 1 25); do
  S=$(curl -s --max-time 6 http://127.0.0.1:4500/status 2>/dev/null)
  ST=$(echo "$S" | sed -n 's/.*"login_step":"\([^"]*\)".*/\1/p')
  echo "  $i: step=$ST"
  [ "$ST" = "pronto" ] || [ "$ST" = "loggato" ] && { echo "$S"; break; }
  sleep 4
done
echo "=== ultimi log boot ==="
journalctl -u groupama-scraper.service -n 8 --no-pager 2>/dev/null | tail -8
