cd /opt/withus-backend 2>/dev/null
HASH=$(git rev-parse origin/claude/vibrant-tesla-o0glfd 2>/dev/null | cut -c1-7)
echo "=== attendo autopull (ultimo commit AXA) ==="
for i in $(seq 1 30); do git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null; L=$(git rev-parse HEAD|cut -c1-7); echo "  $i: $L"; [ "$L" = "$HASH" ] && break; sleep 6; done
sleep 8
echo "=== axa-scraper attivo? ==="
echo "  active: $(systemctl is-active axa-scraper.service) · ActiveEnter: $(systemctl show axa-scraper.service -p ActiveEnterTimestamp --value 2>/dev/null)"
echo "=== AXA /status (login_msg deve citare Guardian; url = link configurato) ==="
curl -s --max-time 12 http://127.0.0.1:4700/status 2>&1; echo
