echo "=== MEMORIA ==="; free -m | head -2
echo "=== CPU load ==="; uptime
echo "=== processi chrome (quanti?) ==="; pgrep -c -f "chrome|chromium" 2>/dev/null
echo "=== top 6 per RAM ==="; ps -eo rss,comm --sort=-rss 2>/dev/null | head -7 | awk '{printf "%6dMB  %s\n",$1/1024,$2}'
echo "=== scraper attivi ==="; for s in italiana hdi groupama axa prima allianz moto; do echo -n "$s: $(systemctl is-active $s-scraper.service 2>/dev/null || systemctl is-active moto-scraper.service 2>/dev/null) "; done; echo
echo "=== risposta scraper (status, timeout 8s) ==="
for p in 4300:italiana 4400:hdi 4500:groupama 4700:axa; do
  port=${p%%:*}; nm=${p##*:}
  code=$(curl -s -o /dev/null -w "%{http_code}/%{time_total}s" --max-time 8 http://127.0.0.1:$port/status 2>/dev/null)
  echo "  $nm ($port): ${code:-NESSUNA RISPOSTA}"
done
