cd /opt/withus-backend 2>/dev/null
for i in $(seq 1 30); do git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null; L=$(git rev-parse HEAD|cut -c1-7); [ "$L" = "786bc1b" ] && { echo "autopull ok"; break; }; sleep 4; done
sudo systemctl restart withus-backend.service 2>&1; sleep 6
echo "=== rotta Groupama presente? (404=assente; 400/401=presente) ==="
for EP in preventivoGroupama/start preventivoHDI/start; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 6 -X POST http://127.0.0.1:3000/moto/$EP -H 'content-type: application/json' -d '{}' 2>/dev/null)
  echo "  POST /moto/$EP -> $code"
done
echo "=== backend attivo ==="; systemctl is-active withus-backend.service
