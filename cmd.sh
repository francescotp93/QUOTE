echo "=== lancio /accedi (test reale) ==="
curl -s --max-time 120 -X POST http://127.0.0.1:4700/accedi 2>&1; echo
echo "=== dove e' finita la pagina ==="
curl -s --max-time 15 http://127.0.0.1:4700/logindump 2>&1 | head -c 700; echo
echo "=== log AXA (sequenza) ==="
journalctl -u axa-scraper.service --since "-4 min" --no-pager 2>/dev/null | grep -iE "fill user|guardian|2FA|schermata|loggato|invio|err|click|password|manuale" | tail -18
