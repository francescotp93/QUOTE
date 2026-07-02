set +e
echo "== stato processo scraper (CPU/MEM/uptime) =="
systemctl show hdi-scraper -p ActiveEnterTimestamp -p MainPID 2>&1
ps -o pid,pcpu,pmem,etime,rss,cmd -p $(systemctl show hdi-scraper -p MainPID --value) 2>&1 | head -3
echo "== ultimi 40 log scraper (ultimi 40 min) =="
journalctl -u hdi-scraper --since "-40 min" --no-pager 2>/dev/null | tail -40
echo "== test /status con timeout corto (5s): risponde o è bloccato? =="
timeout 8 curl -s --max-time 6 "http://127.0.0.1:4400/status" 2>&1 | head -c 200; echo " [exit $?]"
echo "---fine---"
