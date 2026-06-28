echo "=== RISORSE ==="
free -m | awk '/Mem:/{print "RAM: "$4"MB liberi / "$2"MB ("int($3/$2*100)"% usata)"}'
echo "load:$(uptime|grep -o 'average.*') · chrome=$(pgrep -c -f chrome)"
echo "=== SERVIZI ==="
for s in withus-backend italiana-scraper hdi-scraper groupama-scraper moto-scraper axa-scraper prima-scraper allianz-scraper; do
  st=$(systemctl is-active $s.service 2>/dev/null)
  nr=$(systemctl show $s.service -p NRestarts --value 2>/dev/null)
  echo "  $s: $st (riavvii: $nr)"
done
echo "=== SCRAPER RISPONDONO (status) ==="
for p in 4300:italiana 4400:hdi 4500:groupama 4100:moto 4700:axa; do
  port=${p%%:*}; nm=${p##*:}
  echo "  $nm: $(curl -s -o /dev/null -w '%{http_code} %{time_total}s' --max-time 12 http://127.0.0.1:$port/status 2>/dev/null)"
done
echo "=== STATO LOGIN (loggati?) ==="
for p in 4500:groupama 4700:axa; do
  port=${p%%:*}; nm=${p##*:}
  echo "  $nm: $(curl -s --max-time 12 http://127.0.0.1:$port/status 2>/dev/null | sed -n 's/.*\("loggato":[a-z]*\).*\("login_step":"[^"]*"\).*/\1 \2/p')"
done
echo "=== AXA: crash loop? (ultimi recovery/exit) ==="
journalctl -u axa-scraper.service --since "-15 min" --no-pager 2>/dev/null | grep -icE "recovery|rilancio|exit|X server"
