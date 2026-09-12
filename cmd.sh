echo "== ora"; date '+%F %T'
echo "== auth.json (data e dimensione)"
for c in axa groupama; do f=/opt/withus-backend/scraper/$c/auth.json; [ -f "$f" ] && printf '%-9s %s  %s byte\n' "$c" "$(date -r "$f" '+%F %T')" "$(stat -c%s "$f")" || echo "$c: assente"; done
echo "== stato login"
for pair in "axa 4700" "groupama 4500"; do set -- $pair; printf "%-10s " "$1"; curl -s -m 8 "http://127.0.0.1:$2/loginstate" | head -c 250; echo; done
echo "== log axa ultimi 25 minuti"
journalctl -u axa-scraper --since '-25min' --no-pager 2>&1 | tail -25
