systemctl start withus-autopull.service 2>/dev/null || true
for i in $(seq 1 24); do git -C /opt/withus-backend log --oneline -1 2>/dev/null | grep -q "cattura preventivo Matrix via bookmarklet" && break; sleep 5; done
echo "commit: $(git -C /opt/withus-backend log --oneline -1 2>/dev/null)"
systemctl restart withus-backend 2>/dev/null; sleep 5
echo "=== POST /fonti/allianz/cattura-pub (text/plain, come sendBeacon) ==="
curl -s --max-time 10 -X POST -H 'Content-Type: text/plain' --data '[{"m":"POST","u":"/matrix/test/calcola","resp":"{\"premio\":123}"}]' http://127.0.0.1:3000/fonti/allianz/cattura-pub 2>/dev/null; echo
echo "=== file salvato? ==="
ls -la /opt/withus-backend/server/allianz-cattura.json 2>/dev/null && echo "--- contenuto ---" && head -c 200 /opt/withus-backend/server/allianz-cattura.json
