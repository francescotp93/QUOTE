set +e
cd /opt/withus-backend || { echo NO REPO; exit 0; }
echo "=== HEAD deployato ==="
git log -1 --format='%h %ci %s' 2>&1
echo "=== fetch del branch deploy (funziona il token?) ==="
git fetch origin claude/vibrant-tesla-o0glfd 2>&1 | head -5
echo "REMOTE atteso: 2521d66 (favicon sync)"
echo "FETCH_HEAD: $(git rev-parse --short FETCH_HEAD 2>&1)"
echo "HEAD locale: $(git rev-parse --short HEAD 2>&1)"
echo "=== autopull.sh sul disco ha il self-heal? ==="
grep -c 'SELF-HEAL' /opt/withus-backend/deploy/autopull.sh 2>/dev/null
echo "=== allianz sul disco ha la patch nuova? ==="
grep -c 'openFastQuote tentativo' /opt/withus-backend/scraper/allianz/quote-service.mjs 2>/dev/null
echo "=== moto.js sul disco ha il bersani Allianz? ==="
grep -c "q.set('bersani'" /opt/withus-backend/server/moto.js 2>/dev/null
echo "=== ultimi log autopull ==="
sudo journalctl -u withus-autopull.service --no-pager -n 15 2>&1 | tail -15
echo "=== timer autopull attivo? ==="
systemctl is-active withus-autopull.timer; systemctl is-enabled withus-autopull.timer
echo "---fine---"
