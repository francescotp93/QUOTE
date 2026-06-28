echo "=== attendo e controllo /status (5 tentativi) ==="
for i in 1 2 3 4 5; do S=$(curl -s --max-time 12 http://127.0.0.1:4700/status 2>/dev/null); echo "  $i: ${S:0:120}"; [ -n "$S" ] && break; sleep 8; done
echo "=== log avvio axa (completi, ultimi 4 min) ==="
journalctl -u axa-scraper.service --since "-4 min" --no-pager 2>/dev/null | tail -25
