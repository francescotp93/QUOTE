echo "== ora"; date '+%F %T'
for c in axa groupama; do f=/opt/withus-backend/scraper/$c/auth.json; [ -f "$f" ] && printf '%-9s %s  %s byte\n' "$c" "$(date -r "$f" '+%F %T')" "$(stat -c%s "$f")"; done
for pair in "axa 4700" "groupama 4500"; do set -- $pair; printf "%-10s " "$1"; curl -s -m 8 "http://127.0.0.1:$2/loginstate" | head -c 200; echo; done
