cd /opt/withus-backend 2>/dev/null
for i in $(seq 1 30); do git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null; [ "$(git rev-parse HEAD|cut -c1-7)" = "c7baaaf" ] && { echo "autopull ok"; break; }; sleep 6; done
sleep 14
echo "=== portale AXA: cerco EMISSIONE MOTOR (dump completo link) ==="
curl -s --max-time 45 "http://127.0.0.1:4700/explore?goto=https://mobility.axa-italia.it/portal/&all=1" 2>&1 > /tmp/ax.json
grep -iE "\"url\"|\"title\"" /tmp/ax.json | head -2
echo "--- voci con emissione/motor/auto/preventiv ---"
grep -iE "emissione|motor|\"t\":.*auto|preventiv|nuova" /tmp/ax.json | head -25
