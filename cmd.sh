cd /opt/withus-backend 2>/dev/null
echo "=== attendo che l'autopull porti il repo a 0868aa5 (timer ogni 60s) ==="
for i in $(seq 1 40); do L=$(git rev-parse HEAD 2>/dev/null|cut -c1-7); echo "  $i: HEAD=$L"; [ "$L" = "0868aa5" ] && break; sleep 8; done
echo "=== il prima-scraper si e' riavviato DA SOLO? ==="
echo "  ActiveEnter: $(systemctl show prima-scraper.service -p ActiveEnterTimestamp --value 2>/dev/null)"
echo "  adesso:      $(date '+%a %Y-%m-%d %H:%M:%S %Z')"
echo "=== log autopull recenti ==="
journalctl -u withus-autopull.service --since "-4 min" --no-pager 2>/dev/null | grep -iE "aggiorno|riavviato|prima" | tail -8
echo "=== prima /status (codice nuovo? cerco endpoint guidati) ==="
sleep 3
curl -s --max-time 8 http://127.0.0.1:4600/status 2>&1; echo
echo "=== /accedi esiste? (lo chiamo NO: solo testo. Verifico /resend che e' innocuo) ==="
curl -s --max-time 10 http://127.0.0.1:4600/resend 2>&1; echo
