echo "RAM: $(free -m | awk '/Mem:/{print $4"MB liberi / "$2"MB"}') · chrome=$(pgrep -c -f chrome) · $(uptime | grep -o 'average.*')"
echo "=== scraper attivi ==="
for s in italiana hdi groupama moto axa prima allianz; do echo -n "$s=$(systemctl is-active $s-scraper.service 2>/dev/null) "; done; echo
echo "=== rispondono? (quotanti) ==="
for p in 4300:italiana 4400:hdi 4500:groupama 4100:moto; do
  port=${p%%:*}; nm=${p##*:}
  echo "  $nm: $(curl -s -o /dev/null -w '%{http_code} %{time_total}s' --max-time 12 http://127.0.0.1:$port/status 2>/dev/null)"
done
