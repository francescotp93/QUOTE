echo "=== scraper su? ==="
curl -s --max-time 10 http://127.0.0.1:4600/status 2>&1; echo
echo "=== /accedi (timeout 200s) ==="
curl -s --max-time 200 -X POST http://127.0.0.1:4600/accedi 2>&1; echo
echo "=== status finale ==="
curl -s --max-time 10 http://127.0.0.1:4600/status 2>&1; echo
echo "=== log prima (cosa ha incontrato) ==="
journalctl -u prima-scraper.service --since "-5 min" --no-pager 2>/dev/null | grep -iE "fill user|2FA|schermata|cloudflare|block|TOTP|loggato|recovery|err" | tail -12
