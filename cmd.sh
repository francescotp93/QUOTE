cd /opt/withus-backend 2>/dev/null
LAST=$(git rev-parse origin/claude/vibrant-tesla-o0glfd 2>/dev/null|cut -c1-7)
for i in $(seq 1 30); do git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null; [ "$(git rev-parse HEAD|cut -c1-7)" = "$LAST" ] && { echo "autopull ok"; break; }; sleep 6; done
sleep 12
echo "=== AXA /status: loggato deve diventare true (verifica navigando al portale) ==="
for i in $(seq 1 8); do
  S=$(curl -s --max-time 20 http://127.0.0.1:4700/status 2>/dev/null)
  echo "  $i: ${S:0:150}"
  echo "$S" | grep -q '"loggato":true' && { echo ">>> AXA VERDE"; break; }
  sleep 5
done
