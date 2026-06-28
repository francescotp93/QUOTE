echo "=== /accedi (PROSEGUI robusto) ==="
curl -s --max-time 110 -X POST http://127.0.0.1:4700/accedi 2>&1 | head -c 350; echo
echo "=== pagina ora (deve essere Guardian o password, non piu' step1) ==="
curl -s --max-time 15 http://127.0.0.1:4700/logindump 2>&1 | head -c 450; echo
echo "=== log step ==="
journalctl -u axa-scraper.service --since "-3 min" --no-pager 2>/dev/null | grep -iE "AXA:|guardian|otp|attesa|loggato|err" | tail -12
