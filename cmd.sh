cd /opt/withus-backend
echo "HEAD: $(git rev-parse HEAD|cut -c1-7)  origin: $(git rev-parse origin/claude/vibrant-tesla-o0glfd 2>/dev/null|cut -c1-7)"
echo "axa safeLoginUrl nel codice live: $(grep -c safeLoginUrl scraper/axa/quote-service.mjs)  perf-flag: $(grep -c renderer-process-limit scraper/axa/quote-service.mjs)"
echo "axa service: $(systemctl is-active axa-scraper.service)/R$(systemctl show axa-scraper.service -p NRestarts --value)  uptime: $(systemctl show axa-scraper.service -p ActiveEnterTimestamp --value)"
echo "RAM $(free -m|awk '/Mem:/{print $4"MB liberi"}')  load:$(uptime|grep -o 'average.*')  chrome=$(pgrep -c -f chrome)"
echo "--- axa /status ---"; curl -s --max-time 14 http://127.0.0.1:4700/status; echo
