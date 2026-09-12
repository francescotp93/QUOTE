echo "ora: $(date '+%F %T %Z')"
for p in "axa 4700" "groupama 4500"; do set -- $p; printf '%-10s %s\n' "$1" "$(curl -s -m 8 http://127.0.0.1:$2/status | python3 -c 'import sys,json; d=json.load(sys.stdin); print("loggato:",d.get("loggato"),"| stato:",d.get("login_step"),"|",d.get("login_msg","")[:90])' 2>/dev/null || echo '(stato non leggibile)')"; done
echo "--- ultimi eventi groupama:"; journalctl -u groupama-scraper --since '2026-09-12 09:00' --no-pager 2>/dev/null | grep -iE 'sessione|login|caduta|otp' | tail -6 | cut -c1-170
