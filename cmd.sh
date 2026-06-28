echo "=== AXA /status (loggato?) ==="
curl -s --max-time 12 http://127.0.0.1:4700/status 2>&1; echo
echo "=== portale AXA: testo + menu (cerco EMISSIONE MOTOR) ==="
curl -s --max-time 40 "http://127.0.0.1:4700/explore" 2>&1 > /tmp/axp.json
grep -iE "\"url\"|\"text\"|emissione|motor|quotiamo|preventiv" /tmp/axp.json | head -8 | cut -c1-200
echo "--- voci/menu ---"; grep -iE "\"t\"|emissione|motor" /tmp/axp.json | head -25
