echo "=== tengo SPENTI prima/allianz (risparmio RAM), riavvio solo AXA ==="
sudo systemctl stop prima-scraper.service allianz-scraper.service 2>/dev/null
sudo systemctl restart axa-scraper.service 2>/dev/null
sleep 16
echo "RAM: $(free -m | awk '/Mem:/{print $4"MB liberi"}') · chrome=$(pgrep -c -f chrome) · $(uptime|grep -o 'average.*')"
echo "axa attivo: $(systemctl is-active axa-scraper.service)"
echo "axa risponde: $(curl -s -o /dev/null -w '%{http_code} %{time_total}s' --max-time 12 http://127.0.0.1:4700/status 2>/dev/null)"
echo "=== ricontrollo quotanti ancora OK ==="
for p in 4300:italiana 4400:hdi 4500:groupama; do port=${p%%:*}; nm=${p##*:}; echo "  $nm: $(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:$port/status 2>/dev/null)"; done
