
set +e
echo "== diagnostica chiave GPG =="
curl -fsSL https://pkg.cloudflareone.com/cloudflare-warp-ascii.gpg -o /tmp/cf.key 2>/tmp/cf.err
echo "curl rc=$? size=$(wc -c </tmp/cf.key 2>/dev/null)"; echo "err:"; cat /tmp/cf.err; echo "head:"; head -c 120 /tmp/cf.key; echo ""

echo "== installo cloudflare-warp (codename noble) =="
cat /tmp/cf.key | sudo gpg --yes --dearmor -o /usr/share/keyrings/cloudflare-warp-archive-keyring.gpg 2>&1 | tail -2
echo "keyring size: $(sudo wc -c </usr/share/keyrings/cloudflare-warp-archive-keyring.gpg 2>/dev/null)"
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] https://pkg.cloudflareone.com/ noble main" | sudo tee /etc/apt/sources.list.d/cloudflare-client.list
sudo apt-get update -y >/tmp/warp-apt.log 2>&1; echo "apt-update rc=$?"; grep -i "cloudflareone\|warp\|^Err\|^W:" /tmp/warp-apt.log | head
sudo apt-get install -y cloudflare-warp >>/tmp/warp-apt.log 2>&1; echo "install rc=$?"; tail -4 /tmp/warp-apt.log

echo "== warp-cli version =="
warp-cli --version 2>&1
if ! which warp-cli >/dev/null 2>&1; then echo "WARP NON INSTALLATO - stop"; echo "---fine---"; exit 0; fi

sudo systemctl enable --now warp-svc 2>&1 | tail -1; sleep 3
sudo warp-cli --accept-tos registration new 2>&1 | tail -2
sudo warp-cli --accept-tos mode proxy 2>&1 | tail -1
sudo warp-cli --accept-tos proxy port 40000 2>&1 | tail -1
sudo warp-cli --accept-tos connect 2>&1 | tail -1
sleep 6
warp-cli --accept-tos status 2>&1 | tail -3
echo "== IP via WARP socks5 40000 =="
timeout 12 curl -s --max-time 10 -x socks5h://127.0.0.1:40000 https://ifconfig.me 2>/dev/null; echo ""
echo "== PRIMA via WARP =="
timeout 20 curl -s --max-time 18 -x socks5h://127.0.0.1:40000 -o /dev/null -w "http=%{http_code} ip=%{remote_ip}\n" "https://intermediari.prima.it/login" 2>&1
timeout 20 curl -s --max-time 18 -x socks5h://127.0.0.1:40000 "https://intermediari.prima.it/login" 2>/dev/null | grep -io "you have been blocked\|just a moment\|attention required\|<title>[^<]*</title>" | head -3
echo "---fine---"
