echo "== HEAD backend"
git -C /opt/withus-backend log --oneline -1 2>&1
echo "== autopull ultimo giro"
journalctl -u withus-autopull --since '-20min' --no-pager 2>&1 | tail -15
echo "== servizi"
for s in withus-backend axa-scraper groupama-scraper hdi-scraper italiana-scraper allianz-scraper moto-scraper; do
  printf '%-20s %s  attivo da: %s\n' "$s" "$(systemctl is-active $s 2>&1)" "$(systemctl show -p ActiveEnterTimestamp --value $s 2>&1)"
done
echo "== health"
curl -s -m 8 http://127.0.0.1:8080/health 2>&1 | head -c 300; echo
echo "== file nuovi presenti?"
ls -l /opt/withus-backend/server/otpPosta.js /opt/withus-backend/server/esiti.js 2>&1
