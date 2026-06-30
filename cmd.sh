echo "=== servizio hdi-scraper ==="
systemctl is-active hdi-scraper.service 2>/dev/null
sudo systemctl status hdi-scraper.service --no-pager 2>/dev/null | tail -6
echo "=== attendo avvio browser (25s) ==="
sleep 25
echo "--- status (retry) ---"
for i in 1 2 3; do
  r=$(curl -s -m 20 "http://127.0.0.1:4400/status" 2>/dev/null)
  if [ -n "$r" ]; then echo "$r"; break; fi
  echo "(vuoto, retry $i)"; sleep 8
done
echo ""
echo "--- casaprobe (m150) ---"
curl -s -m 150 "http://127.0.0.1:4400/casaprobe" 2>/dev/null || echo "(probe vuoto/timeout)"
