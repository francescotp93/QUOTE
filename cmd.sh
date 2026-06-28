echo "=== /status AXA adesso (esito del login precedente) ==="
curl -s --max-time 14 http://127.0.0.1:4700/status | sed 's/"url":"[^"]*"/"url":"<omesso>"/'
echo
