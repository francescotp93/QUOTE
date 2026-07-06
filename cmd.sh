
set +e
echo "== resolver di sistema =="
cat /etc/resolv.conf 2>/dev/null | grep -v '^#' | head
echo "== getent (system) =="
getent hosts pkg.cloudflareone.com; echo "getent rc=$?"
echo "== risoluzione con resolver pubblici =="
for R in 1.1.1.1 8.8.8.8 9.9.9.9; do
  echo "-- via $R --"
  timeout 8 getent hosts pkg.cloudflareone.com >/dev/null 2>&1
  # usa nslookup/host se ci sono
  if command -v nslookup >/dev/null; then timeout 8 nslookup pkg.cloudflareone.com $R 2>&1 | grep -A2 -i "name\|address" | head -6; 
  elif command -v host >/dev/null; then timeout 8 host pkg.cloudflareone.com $R 2>&1 | head -4;
  elif command -v dig >/dev/null; then timeout 8 dig +short @$R pkg.cloudflareone.com 2>&1 | head -4;
  else echo "no dns tool"; fi
done
echo "== altri host esterni risolvono? =="
for H in github.com cloudflare.com pkg.cloudflareone.com developers.cloudflare.com; do
  IP=$(timeout 6 getent hosts $H 2>/dev/null | awk '{print $1}' | head -1)
  echo "$H -> ${IP:-FAIL}"
done
echo "== provo a raggiungere pkg via IP Cloudflare noto (SNI) =="
# pkg.cloudflareone.com è dietro Cloudflare; provo risoluzione via DoH cloudflare
timeout 10 curl -s --max-time 8 "https://1.1.1.1/dns-query?name=pkg.cloudflareone.com&type=A" -H "accept: application/dns-json" 2>/dev/null | head -c 400; echo ""
echo "---fine---"
