echo "== UNIT hdi =="
systemctl is-active hdi-scraper; systemctl is-enabled hdi-scraper
systemctl show hdi-scraper -p NRestarts -p ActiveEnterTimestamp -p ExecMainPID
echo "== PORTE SCRAPER IN ASCOLTO =="
ss -ltnp 2>/dev/null | grep -E ':4[1-7]00' || echo "(nessuna porta 4x00 in ascolto)"
echo "== HTTP 4400 =="
curl -s -m 8 -o /tmp/h4400.json -w "http_code=%{http_code}\n" http://127.0.0.1:4400/status
head -c 700 /tmp/h4400.json 2>/dev/null; echo
echo "== PROCESSI hdi =="
ps -eo pid,etime,rss,args 2>/dev/null | grep "scraper/hdi" | grep -v grep | head -12
echo "== LOCK =="
ls -l /tmp/hdi-scraper.lock 2>/dev/null; fuser -v /tmp/hdi-scraper.lock 2>&1 | head -8
echo "== LOG hdi (ultimi) =="
journalctl -u hdi-scraper -n 70 --no-pager 2>/dev/null | tail -c 7000
