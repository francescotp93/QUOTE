echo "=== HEALTH CHECK QUOTATORI ==="
for p in "italiana:4300" "24H/moto:4100" "hdi:4400" "hdi-tunnel:4401" "groupama:4500" "prima:4600" "axa:4700" "allianz:4200" "assieasy:4800"; do
  name=${p%%:*}; port=${p##*:}
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 6 "http://127.0.0.1:$port/health" 2>/dev/null)
  body=$(curl -s --max-time 6 "http://127.0.0.1:$port/status" 2>/dev/null | head -c 160)
  printf "%-16s port %-5s  /health=%s  /status=%s\n" "$name" "$port" "${code:-DOWN}" "${body:-—}"
done
