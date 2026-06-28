echo "trigger /accedi..."; curl -s --max-time 6 "http://127.0.0.1:4700/accedi" ; echo
sleep 32
echo "=== /status dopo accedi ==="; curl -s --max-time 14 http://127.0.0.1:4700/status; echo
echo "=== /logindump dopo accedi (testo pagina + controlli) ==="; curl -s --max-time 18 http://127.0.0.1:4700/logindump
