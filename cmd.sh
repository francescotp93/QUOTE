echo "=== Verifica endpoint /sniff su tutti gli scraper (post-deploy) ==="
sleep 70  # attendo il redeploy degli scraper modificati
for pc in "italiana:4300" "24H:4100" "hdi:4400" "groupama:4500" "axa:4700" "allianz:4200" "prima:4600" "assieasy:4800"; do
  name=${pc%%:*}; port=${pc##*:}
  st=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "http://127.0.0.1:$port/sniff/start" 2>/dev/null)
  sp=$(curl -s --max-time 8 "http://127.0.0.1:$port/sniff/stop" 2>/dev/null | head -c 80)
  printf "%-10s start=%s  stop=%s\n" "$name" "${st:-DOWN}" "${sp:-—}"
done
