echo "=== AXA /status ==="
curl -s --max-time 12 http://127.0.0.1:4700/status 2>&1; echo
echo "=== dove si trova la pagina (url/title/testo/campi) ==="
curl -s --max-time 15 http://127.0.0.1:4700/logindump 2>&1 | head -c 800; echo
echo "=== log AXA ultimi 6 min ==="
journalctl -u axa-scraper.service --since "-6 min" --no-pager 2>/dev/null | grep -iE "fill user|guardian|2FA|schermata|loggato|invio|err|recovery|click|password" | tail -15
