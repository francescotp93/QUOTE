echo "== auth.json axa e groupama (data, non contenuto)"
for c in axa groupama; do
  f=$(ls -1 /opt/withus-backend/scraper/$c/auth.json /opt/withus-backend/scraper/$c/*/auth.json 2>/dev/null | head -3)
  [ -z "$f" ] && { echo "$c: nessun auth.json trovato"; continue; }
  for x in $f; do printf '%-9s %s  %s byte\n' "$c" "$(date -r "$x" '+%F %T')" "$(stat -c%s "$x")"; done
done
echo "== dove lo cerca il codice axa"
grep -n "auth.json" /opt/withus-backend/scraper/axa/quote-service.mjs | head -5
echo "== stato login (rotta giusta)"
for pair in "axa 4700" "groupama 4500"; do set -- $pair; printf "%-10s " "$1"; curl -s -m 6 "http://127.0.0.1:$2/stato" | head -c 250; echo; done
