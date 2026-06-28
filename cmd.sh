cd /opt/withus-backend 2>/dev/null
LAST=$(git rev-parse origin/claude/vibrant-tesla-o0glfd 2>/dev/null|cut -c1-7)
for i in $(seq 1 30); do git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null; [ "$(git rev-parse HEAD|cut -c1-7)" = "$LAST" ] && { echo "autopull ok ($LAST)"; break; }; sleep 6; done
sleep 8
echo "=== backend riavviato? rotta /loginstate presente? (401=si) ==="
echo "  backend active: $(systemctl is-active withus-backend.service)"
for EP in loginstate accedi; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 6 http://127.0.0.1:3000/fonti/c-axa/$EP 2>/dev/null)
  echo "  GET /fonti/c-axa/$EP -> $code"
done
echo "=== scraper /accedi ora ritorna SUBITO? (AXA gia' loggato) ==="
t0=$(date +%s); curl -s --max-time 20 -X POST http://127.0.0.1:4700/accedi 2>&1 | head -c 120; echo " (durata $(( $(date +%s)-t0 ))s)"
echo "=== loginstate scraper ==="
curl -s --max-time 8 http://127.0.0.1:4700/loginstate 2>&1 | head -c 160
