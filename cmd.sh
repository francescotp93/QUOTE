set +e
echo "=== versione codice attiva: c'è la nuova openFastQuote? ==="
grep -c 'openFastQuote tentativo' /opt/withus-backend/scraper/allianz/quote-service.mjs 2>/dev/null && echo '(>0 = nuovo codice presente sul disco)'
echo "=== quando è ripartito allianz-scraper? ==="
systemctl show allianz-scraper.service -p ActiveEnterTimestamp 2>&1
echo "=== journal: righe fast-quote/tentativo/click/overlay ultime 60 ==="
sudo journalctl -u allianz-scraper.service --no-pager -n 200 2>&1 | grep -iE 'tentativo|fast|click|overlay|preventivo motor|assuntivomotor|relogin|login|error' | tail -50
echo "---fine---"
