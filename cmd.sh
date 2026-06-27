set -u
systemctl start groupama-scraper 2>/dev/null || true
echo "=== stato Groupama (3 letture, deve essere stabile pronto) ==="
for i in 1 2 3; do curl -s --max-time 8 "http://127.0.0.1:4500/status"; echo; sleep 5; done
