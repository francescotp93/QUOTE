cd /opt/withus-backend 2>/dev/null
echo "=== attendo autopull dd76f0d ==="
for i in $(seq 1 40); do L=$(git rev-parse HEAD 2>/dev/null|cut -c1-7); [ "$L" = "dd76f0d" ] && { echo "ok ($L), prima riavviato da autopull"; break; }; sleep 8; done
echo "  prima ActiveEnter: $(systemctl show prima-scraper.service -p ActiveEnterTimestamp --value 2>/dev/null)"
sleep 8
echo "=== test: con stealth, Cloudflare blocca ancora? (apro login Prima) ==="
curl -s --max-time 50 "http://127.0.0.1:4600/explore?goto=https://intermediari.prima.it/login&all=1" 2>&1 > /tmp/ps.json
echo "--- url ---"; grep "\"url\"" /tmp/ps.json | head -1
echo "--- testo (se 'blocked' = ancora Cloudflare; se vedo campi/login = passato) ---"; grep "\"text\"" /tmp/ps.json | head -1 | cut -c1-300
echo "--- campi ---"; grep -iE "\"type\":|\"name\":" /tmp/ps.json | head -12
