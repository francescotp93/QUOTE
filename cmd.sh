echo "=== stop servizio ==="
systemctl stop italiana-scraper 2>/dev/null; sleep 4
echo "=== kill TOTALE node+chrome sul profilo italiana ==="
pkill -9 -f "quote-service.mjs" 2>/dev/null; sleep 1
pkill -9 -f "italiana/userdata" 2>/dev/null; sleep 2
echo "residui node: $(pgrep -af quote-service.mjs | wc -l) | residui chrome profilo: $(pgrep -af 'italiana/userdata' | wc -l)"
rm -f /opt/withus-backend/scraper/italiana/userdata/Singleton* /tmp/italiana-scraper.lock 2>/dev/null
echo "=== start pulito (singolo) ==="
systemctl start italiana-scraper
for i in $(seq 1 25); do curl -s -m 6 http://127.0.0.1:4300/status >/dev/null 2>&1 && { echo "up giro $i"; break; }; sleep 3; done
sleep 6
echo "=== verifica: deve esserci UNA sola istanza, sotto il cgroup del servizio ==="
MAIN=$(systemctl show -p MainPID --value italiana-scraper)
echo "MainPID(bash)=$MAIN"
ps -eo pid,ppid,args | grep quote-service.mjs | grep -v grep
echo "=== status ==="
curl -s -m 10 http://127.0.0.1:4300/status; echo
