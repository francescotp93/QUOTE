echo "ora: $(date '+%F %T %Z')"
echo "=== SESSIONI ADESSO"
for p in "axa 4700" "groupama 4500" "hdi 4400" "allianz 4200" "italiana 4300"; do set -- $p
  printf '%-10s %s\n' "$1" "$(curl -s -m 10 http://127.0.0.1:$2/status | python3 -c 'import sys,json;d=json.load(sys.stdin);print("DENTRO" if d.get("loggato") else ("fuori" if d.get("loggato") is False else "non so"),"|",(d.get("login_msg") or d.get("sessione") or "")[:80])' 2>/dev/null || echo '(non risponde)')"
done
echo
echo "=== COSA E' SUCCESSO NEI LOGIN (ultima ora)"
for s in axa groupama hdi; do
  echo "--- $s"
  journalctl -u ${s}-scraper --since '-60min' --no-pager 2>/dev/null | grep -iE 'login|sessione|codice|2FA|OTP|accesso|completato|scadut' | tail -8 | cut -c1-180
done
