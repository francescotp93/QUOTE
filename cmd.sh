echo "=== enable state ==="
systemctl is-enabled assieasy-scraper 2>&1
echo "=== ora server ==="; date '+%T'
echo "=== ULTIME 12 righe journal (se recovery ancora in loop, timestamp ~ adesso) ==="
journalctl -u assieasy-scraper --no-pager -n 12 2>/dev/null | tail -12
echo "=== playwright chromium installato? ==="
ls /root/.cache/ms-playwright/ 2>/dev/null | grep -i chromium || echo "no chromium cache root"
echo "=== /status ==="
curl -s --max-time 8 http://127.0.0.1:4800/status 2>/dev/null
echo
echo "=== /probe (tenta apertura pagina assieasy, mostra se browser vivo) ==="
curl -s --max-time 40 http://127.0.0.1:4800/probe 2>/dev/null | head -c 600
