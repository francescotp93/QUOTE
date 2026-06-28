echo "=== AXA /status ==="
curl -s --max-time 12 http://127.0.0.1:4700/status 2>&1; echo
echo "=== c'e' ancora il campo codice (HOLD attesa_otp)? ==="
curl -s --max-time 12 http://127.0.0.1:4700/logindump 2>&1 | grep -iE "\"url\"|\"text\"" | head -2 | cut -c1-160
