echo "== porta backend"
ss -lntp 2>/dev/null | grep -E 'node|:80|:30' | head -10
echo "== health (porte candidate)"
for p in 8080 3000 3001 8081; do printf "%s -> " "$p"; curl -s -m 5 "http://127.0.0.1:$p/health" | head -c 200; echo; done
echo "== stato login scraper"
for pair in "axa 4700" "groupama 4500"; do
  set -- $pair
  printf "%-10s " "$1"; curl -s -m 6 "http://127.0.0.1:$2/login/stato" | head -c 300; echo
done
echo "== log axa dopo il riavvio"
journalctl -u axa-scraper --since '-10min' --no-pager 2>&1 | tail -20
echo "== log groupama dopo il riavvio"
journalctl -u groupama-scraper --since '-10min' --no-pager 2>&1 | tail -15
