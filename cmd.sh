echo "=== flock disponibile? ==="; which flock || echo "NO FLOCK"
echo "=== ps dei node quote-service (pid ppid avvio cmd) ==="
ps -eo pid,ppid,lstart,args | grep -E 'quote-service.mjs' | grep -v grep
echo "=== albero processi del servizio ==="
systemctl status italiana-scraper --no-pager 2>/dev/null | head -25
echo "=== unit che citano 4300 o quote-service o start-service ==="
grep -rl -E '4300|quote-service|scraper/italiana/start-service' /etc/systemd/system/ 2>/dev/null
echo "=== contenuto lock + chi lo tiene ==="
ls -l /tmp/italiana-scraper.lock 2>/dev/null; command -v fuser >/dev/null && fuser /tmp/italiana-scraper.lock 2>/dev/null
echo "=== start-service.sh deployato (prime 15 righe) ==="
head -15 /opt/withus-backend/scraper/italiana/start-service.sh
