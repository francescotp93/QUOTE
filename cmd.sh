set +e
echo "== IPv4 pubblico =="; timeout 8 curl -s4 --max-time 6 https://ifconfig.me 2>/dev/null; echo ""
echo "== IPv6 pubblico =="; timeout 8 curl -s6 --max-time 6 https://ifconfig.me 2>/dev/null; echo ""
echo "== prima.it via IPv4 (curl -4) =="; timeout 15 curl -s4 --max-time 12 -o /dev/null -w "http=%{http_code} ip=%{remote_ip}\n" "https://intermediari.prima.it/login" 2>&1
echo "  body(4):"; timeout 15 curl -s4 --max-time 12 "https://intermediari.prima.it/login" 2>/dev/null | grep -io "you have been blocked\|just a moment\|attention required\|cf-chl\|login" | head -3
echo "== prima.it via IPv6 (curl -6) =="; timeout 15 curl -s6 --max-time 12 -o /dev/null -w "http=%{http_code} ip=%{remote_ip}\n" "https://intermediari.prima.it/login" 2>&1
echo "  body(6):"; timeout 15 curl -s6 --max-time 12 "https://intermediari.prima.it/login" 2>/dev/null | grep -io "you have been blocked\|just a moment\|attention required\|cf-chl\|login" | head -3
echo "---fine---"
