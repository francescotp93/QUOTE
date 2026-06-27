set -u
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
echo "=== access.hdia.it/uefa/ segue il redirect al login? (-L, mostro la catena) ==="
curl -s -L -o /tmp/u.html -w "finale:%{url_effective} http:%{http_code}\n" --max-time 30 -A "$UA" "https://access.hdia.it/uefa/"
echo "bytes:$(wc -c </tmp/u.html)"; grep -oiE "kc-form|password|username|access denied|forbidden|accedi" /tmp/u.html | sort | uniq -c | head
echo
echo "=== anche /uefa (senza slash) e / con path login ==="
for p in "/uefa" "/uefa/login" "/uefa/home"; do
  CODE=$(curl -s -L -o /dev/null -w "%{http_code} -> %{url_effective}" --max-time 25 -A "$UA" "https://access.hdia.it$p")
  echo "$p : $CODE"
done
