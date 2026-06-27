cd /opt/withus-backend
# attendo che il backend e lo scraper siano sull'ultimo codice
for i in $(seq 1 30); do git rev-parse --short HEAD >/dev/null 2>&1 && break; sleep 5; done
sleep 30
systemctl restart moto-scraper 2>/dev/null; sleep 2
B=http://127.0.0.1:4100
for i in $(seq 1 30); do curl -s -m 6 "$B/status" >/dev/null 2>&1 && { echo "scraper up giro $i"; break; }; sleep 4; done
sleep 3
echo "=== scraper /quote (premio RCA numerico) ==="
curl -s -m 200 "$B/quote?targa=FA85248&nascita=19/05/1995&cf=LMBNGL95E19D423D&comune=TRAPANI" | python3 -c '
import sys,json
d=json.load(sys.stdin)
print("ok:",d.get("ok"),"| premio_totale:",d.get("premio_totale"),"| premio_totale_num:",d.get("premio_totale_num"),"| incendio_furto:",d.get("opzione_incendio_furto"))
print("drive_log:",d.get("drive_log"))
' 2>/dev/null
