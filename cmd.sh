echo "HEAD VPS: $(git -C /opt/withus-backend rev-parse --short HEAD)"
echo "=== HDI: perche' la via diretta non ha risposto (preventivo delle 17:20-17:22 ora italiana = 15:20-15:22 UTC)"
journalctl -u hdi-scraper --since '2026-09-11 15:19:00' --until '2026-09-11 15:23:30' --no-pager 2>/dev/null | grep -iE 'premio-motor|diretta|fallback|_fallback|token|uefa|quotazione|errore|error|timeout|ATTENZIONE|pacchetto' | head -40 | cut -c1-210
echo "=== stato scraper:"
for s in hdi allianz italiana groupama axa; do printf '%s: %s\n' "$s" "$(systemctl is-active ${s}-scraper 2>/dev/null)"; done
echo "=== HDI_DIRECT nel .env del backend: $(grep -c '^HDI_DIRECT=' /opt/withus-backend/server/.env 2>/dev/null) (0 = non impostata, default acceso)"
