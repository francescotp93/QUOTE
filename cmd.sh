cd /opt/withus-backend 2>/dev/null
for i in $(seq 1 30); do git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null; L=$(git rev-parse HEAD|cut -c1-7); [ "$L" = "bc6bd61" ] && { echo "autopull ok"; break; }; sleep 6; done
echo "=== attendo scraper STABILE (status ok 2 volte di fila) ==="
ok=0; for i in $(seq 1 18); do S=$(curl -s --max-time 8 http://127.0.0.1:4700/status 2>/dev/null); if echo "$S" | grep -q '"login_step"'; then ok=$((ok+1)); echo "  $i: ok ($ok) ${S:0:90}"; [ $ok -ge 2 ] && break; else ok=0; echo "  $i: giù"; fi; sleep 6; done
echo "=== /accedi (browser semplice) ==="
curl -s --max-time 110 -X POST http://127.0.0.1:4700/accedi 2>&1 | head -c 400; echo
echo "=== pagina ora ==="
curl -s --max-time 15 http://127.0.0.1:4700/logindump 2>&1 | head -c 500; echo
echo "=== log step ==="
journalctl -u axa-scraper.service --since "-3 min" --no-pager 2>/dev/null | grep -iE "AXA:|guardian|otp|attesa|loggato|err|X server|recovery" | tail -12
