set +e
SVCS="hdi-scraper hdi-tunnel axa-scraper allianz-scraper groupama-scraper italiana-scraper moto-scraper prima-scraper assieasy-scraper withus-backend"
TIMERS="withus-autopull.timer cmd-runner.timer"
echo "=== STATO PRIMA (is-enabled / is-active) ==="
for s in $SVCS; do printf '%-22s enabled=%-9s active=%s\n' "$s" "$(systemctl is-enabled $s.service 2>&1)" "$(systemctl is-active $s.service 2>&1)"; done
for t in $TIMERS; do printf '%-22s enabled=%-9s active=%s\n' "$t" "$(systemctl is-enabled $t 2>&1)" "$(systemctl is-active $t 2>&1)"; done
echo "=== ENABLE (senza --now: non tocco chi gira) ==="
for s in $SVCS; do sudo systemctl enable $s.service >/dev/null 2>&1 && echo "enabled $s" || echo "NO enable $s"; done
for t in $TIMERS; do sudo systemctl enable $t >/dev/null 2>&1 && echo "enabled $t" || echo "NO enable $t"; done
echo "=== avvio quelli enabled ma spenti ==="
for s in $SVCS; do if [ "$(systemctl is-active $s.service 2>&1)" != "active" ]; then sudo systemctl start $s.service >/dev/null 2>&1 && echo "started $s" || echo "NO start $s"; fi; done
echo "=== STATO DOPO ==="
for s in $SVCS; do printf '%-22s enabled=%-9s active=%s\n' "$s" "$(systemctl is-enabled $s.service 2>&1)" "$(systemctl is-active $s.service 2>&1)"; done
for t in $TIMERS; do printf '%-22s enabled=%-9s active=%s\n' "$t" "$(systemctl is-enabled $t 2>&1)" "$(systemctl is-active $t 2>&1)"; done
echo "---fine---"
