
set +e
W=/opt/withus-warp
sudo mkdir -p $W && sudo chmod 777 $W && cd $W

echo "== risolve host WARP API/endpoint? =="
for H in api.cloudflareclient.com engage.cloudflareclient.com github.com objects.githubusercontent.com; do
  IP=$(timeout 6 getent hosts $H 2>/dev/null | awk '{print $1}' | head -1); echo "$H -> ${IP:-FAIL}"
done

echo "== scarico wgcf (via GitHub API) =="
WGCF_URL=$(timeout 15 curl -s --max-time 12 https://api.github.com/repos/ViRb3/wgcf/releases/latest 2>/dev/null | grep -o 'https://[^"]*linux_amd64' | head -1)
echo "wgcf url: ${WGCF_URL:-VUOTO}"
if [ -n "$WGCF_URL" ]; then timeout 40 curl -sL --max-time 35 -o wgcf "$WGCF_URL" && chmod +x wgcf; fi
echo "wgcf size: $(wc -c <wgcf 2>/dev/null) ; ver: $(./wgcf --version 2>&1 | head -1)"

echo "== scarico wireproxy (latest/download, nome senza versione) =="
timeout 40 curl -sL --max-time 35 -o wireproxy.tar.gz "https://github.com/pufferffish/wireproxy/releases/latest/download/wireproxy_linux_amd64.tar.gz"
echo "tgz size: $(wc -c <wireproxy.tar.gz 2>/dev/null)"; tar xzf wireproxy.tar.gz 2>&1 | tail -2; chmod +x wireproxy 2>/dev/null
echo "wireproxy ver: $(./wireproxy --version 2>&1 | head -1)"

echo "== wgcf register + generate =="
if [ ! -f wgcf-account.toml ]; then ./wgcf register --accept-tos 2>&1 | tail -4; fi
./wgcf generate 2>&1 | tail -3
echo "-- profilo --"; sed -e 's/PrivateKey.*/PrivateKey = <hidden>/' wgcf-profile.conf 2>/dev/null

echo "== costruisco config wireproxy (endpoint IP anycast, socks 40000) =="
if [ -f wgcf-profile.conf ]; then
  cp wgcf-profile.conf wp.conf
  sed -i 's#Endpoint = .*#Endpoint = 162.159.192.1:2408#' wp.conf
  printf '\n[Socks5]\nBindAddress = 127.0.0.1:40000\n' >> wp.conf
  pkill -f 'wireproxy -c' 2>/dev/null; sleep 1
  nohup ./wireproxy -c wp.conf >wp.log 2>&1 &
  sleep 7
  echo "-- wp.log --"; tail -8 wp.log
  echo "== IP via WARP =="
  timeout 15 curl -s --max-time 12 -x socks5h://127.0.0.1:40000 https://ifconfig.me 2>/dev/null; echo ""
  echo "== trace warp =="
  timeout 15 curl -s --max-time 12 -x socks5h://127.0.0.1:40000 https://www.cloudflare.com/cdn-cgi/trace 2>/dev/null | grep -E 'warp|ip=' | head -3
  echo "== PRIMA via WARP =="
  timeout 25 curl -s --max-time 22 -x socks5h://127.0.0.1:40000 -o /dev/null -w "http=%{http_code} ip=%{remote_ip}\n" "https://intermediari.prima.it/login" 2>&1
  timeout 25 curl -s --max-time 22 -x socks5h://127.0.0.1:40000 "https://intermediari.prima.it/login" 2>/dev/null | grep -io "you have been blocked\|just a moment\|attention required\|<title>[^<]*</title>" | head -3
else echo "NO PROFILO - register fallito"; fi
echo "---fine---"
