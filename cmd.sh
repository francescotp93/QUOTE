cd /opt/withus-backend 2>/dev/null
for i in $(seq 1 30); do git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null; L=$(git rev-parse HEAD|cut -c1-7); [ "$L" = "9700747" ] && { echo "ok"; break; }; sleep 6; done
ok=0; for i in $(seq 1 15); do curl -s --max-time 8 http://127.0.0.1:4700/status 2>/dev/null | grep -q login_step && { ok=$((ok+1)); [ $ok -ge 2 ] && break; } || ok=0; sleep 5; done
echo "=== /accedi (submit robusto) ==="
curl -s --max-time 110 -X POST http://127.0.0.1:4700/accedi 2>&1 | head -c 350; echo
echo "=== pagina ora (deve essere avanzata: password/Guardian/loggato) ==="
curl -s --max-time 15 http://127.0.0.1:4700/logindump 2>&1 | grep -iE "\"url\"|\"text\"" | head -2 | cut -c1-200
echo "=== log ==="
journalctl -u axa-scraper.service --since "-3 min" --no-pager 2>/dev/null | grep -iE "AXA:|guardian|otp|attesa|loggato|err" | tail -12
