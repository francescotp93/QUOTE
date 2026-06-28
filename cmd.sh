cd /opt/withus-backend
LAST=$(git rev-parse origin/claude/vibrant-tesla-o0glfd 2>/dev/null|cut -c1-7)
for i in $(seq 1 30); do git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null; [ "$(git rev-parse HEAD|cut -c1-7)" = "$LAST" ] && { echo "deploy ok ($LAST)"; break; }; sleep 6; done
sleep 28
echo "=== flag/perf attivi? ==="; echo "groupama renderer-limit: $(grep -c renderer-process-limit scraper/groupama/quote-service.mjs)  axa safeLoginUrl: $(grep -c safeLoginUrl scraper/axa/quote-service.mjs)"
echo "=== RISORSE ==="; free -m | awk '/Mem:/{print "RAM "$4"MB liberi / "$2"MB tot"}'; echo "load:$(uptime|grep -o 'average.*') chrome_proc=$(pgrep -c -f chrome)"
echo "=== /status quotanti (http) ==="
for p in 4300:italiana 4400:hdi 4500:groupama 4100:moto 4700:axa; do port=${p%%:*}; nm=${p##*:}; echo "  $nm: $(curl -s -o /dev/null -w '%{http_code}' --max-time 14 http://127.0.0.1:$port/status)"; done
echo "=== axa /status ==="; curl -s --max-time 14 http://127.0.0.1:4700/status; echo
echo "=== servizi NRestarts (deve restare 0/basso) ==="
for s in italiana hdi groupama axa; do echo -n "$s=$(systemctl is-active $s-scraper.service)/R$(systemctl show $s-scraper.service -p NRestarts --value) "; done; echo
