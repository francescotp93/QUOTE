cd /opt/withus-backend 2>/dev/null
echo "=== attendo autopull a3d51e6 ==="
for i in $(seq 1 30); do git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null; L=$(git rev-parse HEAD|cut -c1-7); [ "$L" = "a3d51e6" ] && { echo "ok $L"; break; }; echo "  $i:$L"; sleep 4; done
echo "=== riavvio groupama ==="
sudo systemctl restart groupama-scraper.service 2>&1
sleep 12
echo "=== /status: ora loggato deve essere TRUE (sessione attiva) ==="
for i in $(seq 1 8); do
  S=$(curl -s --max-time 10 http://127.0.0.1:4500/status 2>/dev/null)
  echo "  $i: $S"
  echo "$S" | grep -q '"loggato":true' && { echo ">>> VERDE: loggato=true"; break; }
  sleep 4
done
