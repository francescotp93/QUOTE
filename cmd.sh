curl -s --max-time 50 "http://127.0.0.1:4700/explore?goto=https://ais.axa-italia.it/" 2>&1 >/dev/null
sleep 3
echo "=== elemento 'LOG IN' ==="
curl -s --max-time 15 "http://127.0.0.1:4700/probe?q=log%20in" 2>&1 | head -c 700; echo
echo "=== tutti gli <a> e elementi con onclick (html) ==="
curl -s --max-time 15 "http://127.0.0.1:4700/probe?q=onclick" 2>&1 | head -c 200
