set -u
echo "=== test host HDI candidati (status code + primi byte) dal server ==="
for url in \
  "https://access.hdia.it/" \
  "https://idm.hdia.it/" \
  "https://agenzie.hdia.it/" \
  "https://portale.hdia.it/" \
  "https://www.hdiassicurazioni.it/" \
  "https://hdia.it/" ; do
  CODE=$(curl -s -o /tmp/h.txt -w "%{http_code}" --max-time 20 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36" "$url")
  SNIP=$(tr -d '\n' </tmp/h.txt | sed 's/  */ /g' | cut -c1-90)
  echo "[$CODE] $url → $SNIP"
done
