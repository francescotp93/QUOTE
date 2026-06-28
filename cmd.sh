cd /opt/withus-backend 2>/dev/null
LAST=$(git rev-parse origin/claude/vibrant-tesla-o0glfd 2>/dev/null | cut -c1-7)
echo "=== ultimo commit dev: $LAST ; HEAD locale: $(git rev-parse HEAD|cut -c1-7) ==="
for i in $(seq 1 20); do git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null; [ "$(git rev-parse HEAD|cut -c1-7)" = "$LAST" ] && { echo "autopull allineato"; break; }; sleep 6; done
echo "=== il fix isLoginUrl e' nel file? ==="
grep -c "split('?')\[0\]" scraper/axa/quote-service.mjs
echo "=== AXA /status ==="
for i in 1 2 3 4; do S=$(curl -s --max-time 10 http://127.0.0.1:4700/status 2>/dev/null); echo "  $i: ${S:0:140}"; [ -n "$S" ] && break; sleep 6; done
