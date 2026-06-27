set -u
echo "=== stato iniziale (deve essere pronto e stabile) ==="
curl -s --max-time 8 "http://127.0.0.1:4500/status" | sed 's/.*login_step":"\([^"]*\)".*/step=\1/'
echo "=== avvio login (scraper già stabile col nuovo codice) ==="
curl -s --max-time 12 "http://127.0.0.1:4500/login" >/dev/null 2>&1
sleep 35
echo "=== stato ora ==="
curl -s --max-time 8 "http://127.0.0.1:4500/status"; echo
echo "=== log (cerco fill/OTP/recovery nuovo) ==="
journalctl -u groupama-scraper --no-pager -n 16 2>/dev/null | sed 's/.*\[groupama\]/[groupama]/' | grep -iE "fill|OTP|pagina|credenziali|recovery|risponde|loggato|invio" | tail -10
