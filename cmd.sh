
set +e
echo "== distro =="
. /etc/os-release 2>/dev/null; echo "ID=$ID VERSION_CODENAME=$VERSION_CODENAME"
CODENAME="$VERSION_CODENAME"
# fallback codename se vuoto o non supportato dal repo Cloudflare
case "$CODENAME" in
  bookworm|bullseye|buster|jammy|focal|noble|bionic) : ;;
  *) CODENAME="bookworm" ;;
esac
echo "uso codename repo: $CODENAME"

echo "== warp-cli gia' presente? =="
which warp-cli 2>/dev/null && warp-cli --version 2>/dev/null

if ! which warp-cli >/dev/null 2>&1; then
  echo "== installo cloudflare-warp =="
  curl -fsSL https://pkg.cloudflareone.com/cloudflare-warp-ascii.gpg 2>/dev/null | sudo gpg --yes --dearmor -o /usr/share/keyrings/cloudflare-warp-archive-keyring.gpg
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] https://pkg.cloudflareone.com/ $CODENAME main" | sudo tee /etc/apt/sources.list.d/cloudflare-client.list
  sudo apt-get update -y >/tmp/warp-apt.log 2>&1
  sudo apt-get install -y cloudflare-warp >>/tmp/warp-apt.log 2>&1
  echo "install rc=$? (ultimo log:)"; tail -5 /tmp/warp-apt.log
fi

echo "== warp-cli version =="
warp-cli --version 2>&1

echo "== assicuro warp-svc attivo =="
sudo systemctl enable --now warp-svc 2>&1 | tail -2
sleep 3

echo "== registrazione (idempotente) =="
# nuova sintassi poi vecchia
sudo warp-cli --accept-tos registration new 2>&1 | tail -3 || sudo warp-cli --accept-tos register 2>&1 | tail -3

echo "== modo proxy =="
sudo warp-cli --accept-tos mode proxy 2>&1 | tail -2 || sudo warp-cli --accept-tos set-mode proxy 2>&1 | tail -2

echo "== porta proxy =="
sudo warp-cli --accept-tos proxy port 40000 2>&1 | tail -2

echo "== connect =="
sudo warp-cli --accept-tos connect 2>&1 | tail -2
sleep 6

echo "== status =="
warp-cli --accept-tos status 2>&1 | tail -4

echo "== IP diretto (deve restare OVH) =="
timeout 8 curl -s4 --max-time 6 https://ifconfig.me 2>/dev/null; echo ""
echo "== IP via WARP socks5 40000 =="
timeout 12 curl -s --max-time 10 -x socks5h://127.0.0.1:40000 https://ifconfig.me 2>/dev/null; echo ""

echo "== PRIMA diretto (atteso 403) =="
timeout 15 curl -s4 --max-time 12 -o /dev/null -w "http=%{http_code} ip=%{remote_ip}\n" "https://intermediari.prima.it/login" 2>&1
echo "== PRIMA via WARP =="
timeout 20 curl -s --max-time 18 -x socks5h://127.0.0.1:40000 -o /dev/null -w "http=%{http_code} ip=%{remote_ip}\n" "https://intermediari.prima.it/login" 2>&1
echo "  body(warp):"; timeout 20 curl -s --max-time 18 -x socks5h://127.0.0.1:40000 "https://intermediari.prima.it/login" 2>/dev/null | grep -io "you have been blocked\|just a moment\|attention required\|cf-chl\|<title>[^<]*</title>\|login" | head -4
echo "---fine---"
