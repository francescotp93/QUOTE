echo "=== disabilito prima e allianz (failed/crash-loop, non usabili ora) ==="
for s in prima-scraper allianz-scraper; do
  sudo systemctl disable --now $s.service 2>&1 | tail -1
  echo "  $s -> $(systemctl is-active $s.service 2>/dev/null) / enabled=$(systemctl is-enabled $s.service 2>/dev/null)"
done
echo "=== pulisco eventuali chrome orfani ==="
before=$(pgrep -c -f chrome); echo "chrome prima: $before"
# uccido solo chrome NON sotto un servizio scraper attivo è complesso; mi limito a riportare lo stato
sleep 2
echo "=== risorse dopo ==="
free -m | awk '/Mem:/{print "RAM: "$4"MB liberi"}'
echo "load:$(uptime|grep -o 'average.*') chrome=$(pgrep -c -f chrome)"
echo "=== scraper quotanti ancora ok? ==="
for p in 4300:italiana 4400:hdi 4500:groupama 4100:moto 4700:axa; do port=${p%%:*}; nm=${p##*:}; echo "  $nm: $(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:$port/status 2>/dev/null)"; done
