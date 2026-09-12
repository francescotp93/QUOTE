echo "== ora del server"; date '+%F %T'
echo "== stato login"
for pair in "axa 4700" "groupama 4500"; do set -- $pair; printf "%-10s " "$1"; curl -s -m 8 "http://127.0.0.1:$2/loginstate" | head -c 300; echo; done
echo "== auth.json (data e dimensione, non contenuto)"
for c in axa groupama; do f=/opt/withus-backend/scraper/$c/auth.json; [ -f "$f" ] && printf '%-9s %s  %s byte\n' "$c" "$(date -r "$f" '+%F %T')" "$(stat -c%s "$f")" || echo "$c: assente"; done
echo "== log axa ultimi 40 minuti"
journalctl -u axa-scraper --since '-40min' --no-pager 2>&1 | grep -v 'gracefully\|forcefully\|<kill>' | tail -25
