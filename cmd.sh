echo "=== AXA loggato? ==="
curl -s --max-time 12 http://127.0.0.1:4700/status 2>&1 | cut -c1-150; echo
sleep 3
echo "=== portale AXA: testo + menu (EMISSIONE MOTOR?) ==="
curl -s --max-time 40 "http://127.0.0.1:4700/explore" 2>&1 > /tmp/e.json
grep -iE "\"url\"|\"title\"" /tmp/e.json | head -2
grep -iE "\"text\"" /tmp/e.json | head -1 | cut -c1-400
echo "--- voci ---"; grep -iE "emissione|motor|\"t\":|menu" /tmp/e.json | head -25
