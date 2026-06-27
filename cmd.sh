set -u
echo "=== reset pulito Groupama (stop, wipe, start) ==="
systemctl stop groupama-scraper 2>/dev/null; sleep 2
pkill -9 -f "scraper/groupama/userdata" 2>/dev/null || true
rm -rf /opt/withus-backend/scraper/groupama/userdata 2>/dev/null && echo "userdata wiped"
systemctl start groupama-scraper 2>/dev/null && echo "started"
echo "=== attendo 'pronto' stabile (no restart) ==="
for i in $(seq 1 12); do S=$(curl -s --max-time 6 "http://127.0.0.1:4500/status" 2>/dev/null | sed 's/.*login_step":"\([^"]*\)".*/\1/'); echo "[$i] step=$S"; [ "$S" = "pronto" ] && break; sleep 6; done
echo "=== trigger login UNA volta ==="
curl -s --max-time 12 "http://127.0.0.1:4500/login" >/dev/null 2>&1
sleep 38
echo "=== stato ==="; curl -s --max-time 8 "http://127.0.0.1:4500/status"; echo
echo "=== LOG con timestamp (ultimi 20) ==="
journalctl -u groupama-scraper --no-pager -n 20 --since "90 sec ago" 2>/dev/null | sed 's/vps-59c68330 start-service.sh\[[0-9]*\]: //'
