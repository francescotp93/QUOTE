echo "=== enable (persistente al boot) ==="
systemctl enable assieasy-scraper 2>&1 | tail -1
echo "=== is-active / sub ==="
systemctl show assieasy-scraper -p ActiveState,SubState,ExecMainStatus,NRestarts 2>/dev/null
echo "=== node_modules playwright presente? ==="
ls -d /opt/withus-backend/scraper/assieasy/node_modules/playwright 2>/dev/null && echo PW_OK || echo PW_MANCANTE
echo "=== porta 4800 in ascolto? ==="
ss -ltnp 2>/dev/null | grep -E ':4800' || echo "nessun listener su 4800"
echo "=== journal completo (40) ==="
journalctl -u assieasy-scraper --no-pager -n 40 2>/dev/null | tail -40
echo "=== /status retry ==="
for i in $(seq 1 6); do R=$(curl -s --max-time 5 http://127.0.0.1:4800/status 2>/dev/null); [ -n "$R" ] && { echo "$R"; break; } || sleep 5; done
