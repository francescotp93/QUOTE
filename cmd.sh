echo "== ora"; date '+%F %T'
echo "== auth.json"
for c in axa groupama; do f=/opt/withus-backend/scraper/$c/auth.json; [ -f "$f" ] && printf '%-9s %s  %s byte\n' "$c" "$(date -r "$f" '+%F %T')" "$(stat -c%s "$f")"; done
echo "== stato login"
for pair in "axa 4700" "groupama 4500"; do set -- $pair; printf "%-10s " "$1"; curl -s -m 8 "http://127.0.0.1:$2/loginstate" | head -c 250; echo; done
echo "== axa: cadute e rientri dal login delle 13:38"
journalctl -u axa-scraper --since '13:38' --no-pager 2>&1 | grep -iE 'keep-alive|sessione|login|caduta|scadut' | tail -20
echo "== groupama: cadute e rientri"
journalctl -u groupama-scraper --since '13:33' --no-pager 2>&1 | grep -iE 'caduta|scadut|sessione|codice|login' | tail -20
