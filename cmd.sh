echo "=== /status ==="
curl -s --max-time 10 http://127.0.0.1:4700/status 2>&1 | head -c 160; echo
echo "=== pagina Guardian (testo + campi) ==="
curl -s --max-time 15 http://127.0.0.1:4700/logindump 2>&1 | head -c 700; echo
echo "=== pulsante conferma/verifica/continua (HTML) ==="
curl -s --max-time 12 "http://127.0.0.1:4700/probe?q=continua" 2>&1 | head -c 350
curl -s --max-time 12 "http://127.0.0.1:4700/probe?q=verifica" 2>&1 | head -c 350
echo "=== checkbox 'ricorda 30 giorni' presente? ==="
curl -s --max-time 12 "http://127.0.0.1:4700/probe?q=ricorda" 2>&1 | head -c 300
