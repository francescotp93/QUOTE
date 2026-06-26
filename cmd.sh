cd /opt/withus-backend
for i in $(seq 1 26); do h=$(git rev-parse --short HEAD); [ "$h" = "27d14ed" ] && { echo "deploy 27d14ed giro $i"; break; }; sleep 5; done
systemctl restart moto-scraper 2>/dev/null; sleep 2
B=http://127.0.0.1:4100
for i in $(seq 1 30); do curl -s -m 6 "$B/status" >/dev/null 2>&1 && { echo "moto up giro $i"; break; }; sleep 4; done
sleep 3
echo "=== avvio sniff ==="
curl -s -m 10 "$B/sniff/start"; echo
echo "=== stato ==="; curl -s -m 8 "$B/sniff"; echo
echo "VNC 24H: 127.0.0.1:5900 (display :99)"
