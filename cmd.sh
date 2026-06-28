curl -s --max-time 50 "http://127.0.0.1:4700/explore?goto=https://ais.axa-italia.it/" 2>&1 >/dev/null
sleep 3
echo "=== tutti i controlli (input/button) ==="
curl -s --max-time 15 http://127.0.0.1:4700/logindump 2>&1 | head -c 900; echo
echo "=== submit/button elements (html) ==="
curl -s --max-time 15 "http://127.0.0.1:4700/probe?q=submit" 2>&1 | head -c 600; echo
echo "=== bottoni col testo 'accedi' o 'login' ==="
curl -s --max-time 15 "http://127.0.0.1:4700/probe?q=button" 2>&1 | head -c 500
