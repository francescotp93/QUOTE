cd /opt/withus-backend
git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null
git reset --hard origin/claude/vibrant-tesla-o0glfd -q 2>/dev/null
echo "catena presente:" $(grep -c "casaQuot" scraper/hdi/quote-service.mjs)
sudo systemctl restart hdi-scraper.service 2>/dev/null
echo "=== attendo avvio + login ==="
sleep 18
curl -s -m 90 "http://127.0.0.1:4400/login" >/dev/null 2>&1
for i in $(seq 1 10); do
  s=$(curl -s -m 15 "http://127.0.0.1:4400/status" 2>/dev/null)
  if echo "$s" | grep -q '"loggato":true'; then echo "LOGGATO ($i)"; break; fi
  echo "(login in corso $i)"; sleep 7
done
echo "=== casaprobe (catena completa) ==="
curl -s -m 160 "http://127.0.0.1:4400/casaprobe" 2>/dev/null
echo ""
