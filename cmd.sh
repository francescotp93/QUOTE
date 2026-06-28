echo "=== status (5 tentativi) ==="
for i in 1 2 3 4 5; do S=$(curl -s --max-time 10 http://127.0.0.1:4700/status 2>/dev/null); echo "  $i: ${S:0:130}"; [ -n "$S" ] && break; sleep 6; done
echo "=== log AXA: doCodice/loggato/conferma/err ==="
journalctl -u axa-scraper.service --since "-8 min" --no-pager 2>/dev/null | grep -iE "codice|loggato|conferma|guardian|attesa|otp|accettato|err|recovery" | tail -16
