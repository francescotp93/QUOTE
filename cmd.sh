cd /opt/withus-backend
LAST=$(git rev-parse origin/claude/vibrant-tesla-o0glfd 2>/dev/null|cut -c1-7)
for i in $(seq 1 12); do git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null; [ "$(git rev-parse HEAD|cut -c1-7)" = "$LAST" ] && { echo "deploy ok $LAST"; break; }; sleep 6; done
sleep 16
echo "fix live? oidc=$(grep -c 'rimbalzo' scraper/axa/quote-service.mjs)  axa=$(systemctl is-active axa-scraper.service)/R$(systemctl show axa-scraper.service -p NRestarts --value)"
echo "=== /premio GY263BY (~90s) ==="
curl -s --max-time 175 "http://127.0.0.1:4700/premio?targa=GY263BY&cf=DDOFNC93L17D423L&cognome=ODDO&nome=FRANCESCO&data_nascita=17%2F07%2F1993" 2>/dev/null
echo
