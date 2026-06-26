cd /opt/withus-backend
for i in $(seq 1 26); do h=$(git rev-parse --short HEAD); [ "$h" = "1f97b17" ] && { echo "deploy giro $i"; break; }; sleep 5; done
systemctl restart moto-scraper 2>/dev/null; sleep 2
B=http://127.0.0.1:4100
for i in $(seq 1 30); do curl -s -m 6 "$B/status" >/dev/null 2>&1 && { echo "up giro $i"; break; }; sleep 4; done
sleep 3
curl -s -m 10 "$B/sniff/start"; echo
echo "stato: $(curl -s -m 8 $B/sniff)"
echo "VNC 24H: 127.0.0.1:5900 (display :99). Keep-alive sospeso durante la cattura."
