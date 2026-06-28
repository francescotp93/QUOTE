echo "=== /status (deve essere loggato) ==="
curl -s --max-time 14 http://127.0.0.1:4700/status | sed 's/"url":"[^"]*"/"url":"<omesso>"/'; echo
echo "=== portale: esploro la home per trovare l'ingresso preventivi (DANNI/EMISSIONE) ==="
curl -s --max-time 40 "http://127.0.0.1:4700/explore" 2>/dev/null
