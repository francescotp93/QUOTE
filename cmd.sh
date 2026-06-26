cd /opt/withus-backend
echo "=== deploy ha scraper/hdi? ==="
ls scraper/hdi/ 2>/dev/null | tr '\n' ' '; echo
echo "=== attendo installazione hdi-scraper (autopull: npm+playwright+enable, ~2-3 min) ==="
for i in $(seq 1 40); do
  systemctl is-active hdi-scraper >/dev/null 2>&1 && { echo "service attivo (giro $i)"; break; }
  sleep 6
done
systemctl is-active hdi-scraper 2>/dev/null || echo "service NON ancora attivo"
echo "=== 4400 /status ==="
for i in $(seq 1 20); do r=$(curl -s -m 6 http://127.0.0.1:4400/status 2>/dev/null); [ -n "$r" ] && { echo "$r"; break; }; sleep 5; done
echo "=== log recenti hdi-scraper ==="
journalctl -u hdi-scraper -n 12 --no-pager 2>/dev/null | tail -12
