cd /opt/withus-backend 2>/dev/null
echo "=== attendo autopull b8bcced + restart prima ==="
for i in $(seq 1 40); do L=$(git rev-parse HEAD 2>/dev/null|cut -c1-7); [ "$L" = "b8bcced" ] && { echo "ok"; break; }; sleep 8; done
sleep 14  # tempo per il restart dello scraper
echo "  active: $(systemctl is-active prima-scraper.service) · ActiveEnter: $(systemctl show prima-scraper.service -p ActiveEnterTimestamp --value 2>/dev/null)"
echo "=== chiamo /accedi (prova reale: supera Cloudflare e arriva alla schermata codice?) ==="
curl -s --max-time 120 -X POST http://127.0.0.1:4600/accedi 2>&1; echo
echo "=== dove siamo finiti ==="
curl -s --max-time 10 http://127.0.0.1:4600/status 2>&1; echo
