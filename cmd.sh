echo "ora: $(date '+%F %T %Z')"
for p in "axa 4700" "groupama 4500" "allianz 4200" "italiana 4300" "hdi 4400"; do set -- $p
  printf '%-10s %s\n' "$1" "$(curl -s -m 8 http://127.0.0.1:$2/status | python3 -c 'import sys,json;d=json.load(sys.stdin);print("dentro" if d.get("loggato") else ("FUORI" if d.get("loggato") is False else "non so"), "|", (d.get("login_msg") or d.get("sessione") or "")[:70])' 2>/dev/null || echo '(non risponde)')"
done
echo "preventivi passati dal backend oggi: $(journalctl -u withus-backend --since today --no-pager 2>/dev/null | grep -cE ' (GET|POST) +/(moto/(preventivo|premio)|api/v1/quote)')"
