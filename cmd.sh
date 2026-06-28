echo "=== prima: $(free -m | awk '/Mem:/{print $4"MB liberi"}') · chrome=$(pgrep -c -f chrome) · load=$(uptime | grep -o 'average.*')"
echo "=== fermo tutti gli scraper ==="
for s in italiana hdi groupama axa prima allianz moto; do sudo systemctl stop $s-scraper.service 2>/dev/null; done
sleep 3
echo "=== uccido TUTTI i chrome (zombie inclusi) ==="
sudo pkill -9 -f "chrome|chromium" 2>/dev/null; sleep 4
echo "chrome rimasti: $(pgrep -c -f chrome)"
echo "=== riavvio scraper QUOTANTI per primi (italiana, hdi, groupama, moto), poi gli altri ==="
for s in italiana hdi groupama moto; do sudo systemctl start $s-scraper.service 2>/dev/null; sleep 4; done
for s in axa prima allianz; do sudo systemctl start $s-scraper.service 2>/dev/null; sleep 3; done
sleep 12
echo "=== dopo: $(free -m | awk '/Mem:/{print $4"MB liberi"}') · chrome=$(pgrep -c -f chrome) · load=$(uptime | grep -o 'average.*')"
echo "=== scraper quotanti rispondono? ==="
for p in 4300:italiana 4400:hdi 4500:groupama 4100:moto; do
  port=${p%%:*}; nm=${p##*:}
  echo "  $nm: $(curl -s -o /dev/null -w '%{http_code} %{time_total}s' --max-time 12 http://127.0.0.1:$port/status 2>/dev/null)"
done
