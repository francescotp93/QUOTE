echo "=== restart allianz-scraper ==="
sudo systemctl restart allianz-scraper.service 2>&1 || systemctl restart allianz-scraper.service 2>&1
echo "=== attendo loggato ==="
for i in $(seq 1 15); do
  S=$(curl -s -m 8 "http://127.0.0.1:4200/status" 2>/dev/null)
  echo "$S" | grep -q '"loggato":true' && { echo "PRONTO: $S"; break; }
  sleep 8
done
echo "=== verifica route /motor ==="
curl -s -m 20 "http://127.0.0.1:4200/motor?step=dump&wait=500" 2>/dev/null | head -c 400
