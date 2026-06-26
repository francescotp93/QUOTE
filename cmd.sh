cd /opt/withus-backend
echo "=== attendo che autopull porti il fix 60121cd ==="
for i in $(seq 1 30); do h=$(git rev-parse --short HEAD 2>/dev/null); echo "HEAD=$h (giro $i)"; [ "$h" = "60121cd" ] && break; sleep 5; done
echo "=== restart pulito ==="
systemctl stop italiana-scraper 2>/dev/null; sleep 3
for pid in $(pgrep -f quote-service.mjs); do kill -9 "$pid" 2>/dev/null; done
pkill -9 -f "italiana/userdata" 2>/dev/null || true
rm -f scraper/italiana/userdata/Singleton* 2>/dev/null || true
cp scraper/italiana/deploy/italiana-scraper.service /etc/systemd/system/ 2>/dev/null && systemctl daemon-reload
sleep 2
systemctl start italiana-scraper
echo "=== attendo /status ==="
for i in $(seq 1 25); do curl -s -m 6 http://127.0.0.1:4300/status >/dev/null 2>&1 && { echo "up giro $i"; break; }; sleep 3; done
sleep 3
echo "=== istanze attive (deve essere UNA) ==="
pgrep -af quote-service.mjs
echo "=== status ==="
curl -s -m 10 http://127.0.0.1:4300/status; echo
