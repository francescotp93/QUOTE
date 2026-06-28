echo "=== 2o /accedi (la pagina e' gia' oltre Cloudflare?) ==="
curl -s --max-time 200 -X POST http://127.0.0.1:4600/accedi 2>&1; echo
echo "=== status ==="
curl -s --max-time 10 http://127.0.0.1:4600/status 2>&1; echo
echo "=== dump pagina: dove siamo (login? 2FA? blocco?) ==="
curl -s --max-time 15 http://127.0.0.1:4600/logindump 2>&1 | head -c 600; echo
