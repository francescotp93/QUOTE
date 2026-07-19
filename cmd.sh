set +e
echo "== ASSIEASY DIAG $(date '+%F %T') =="
echo "-- is-active PRE --"; systemctl is-active assieasy-scraper
echo "-- /status PRE --"; curl -s --max-time 8 http://127.0.0.1:4800/status; echo
echo "-- restart --"; systemctl restart assieasy-scraper; echo "rc=$?"
sleep 15
echo "-- is-active POST --"; systemctl is-active assieasy-scraper
echo "-- /status POST --"; curl -s --max-time 15 http://127.0.0.1:4800/status; echo
echo "-- journal last 60 --"; journalctl -u assieasy-scraper -n 60 --no-pager 2>/dev/null | tail -60
