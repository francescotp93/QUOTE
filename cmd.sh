set -u
echo "=== IP pubblico del server (per whitelist HDI) ==="
curl -s --max-time 15 https://api.ipify.org || curl -s --max-time 15 https://ifconfig.me || echo "(non determinato)"
echo
echo "=== controprova: access.hdia.it risponde diverso se NON dal datacenter? (header del 403) ==="
curl -s -D - -o /dev/null --max-time 15 -A "Mozilla/5.0 Chrome/120" "https://access.hdia.it/" | grep -iE "server:|x-|cf-|via:|forbidden" | head
