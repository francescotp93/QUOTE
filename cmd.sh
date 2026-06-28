cd /opt/withus-backend
LAST=$(git rev-parse origin/claude/vibrant-tesla-o0glfd 2>/dev/null|cut -c1-7)
for i in $(seq 1 25); do git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null; [ "$(git rev-parse HEAD|cut -c1-7)" = "$LAST" ] && { echo "deploy ok $LAST"; break; }; sleep 6; done
sleep 20
echo "submit deterministico live? button-entra=$(grep -c button-entra scraper/axa/quote-service.mjs)  diagnosi=$(grep -c 'SCADUTA' scraper/axa/quote-service.mjs)"
curl -s --max-time 6 http://127.0.0.1:4700/accedi >/dev/null; echo "accedi lanciato, seguo l'esito..."
LAST_S=""
for n in $(seq 1 11); do sleep 7; S=$(curl -s --max-time 12 http://127.0.0.1:4700/status); LAST_S="$S"; echo "  [$n] $(echo "$S"|grep -o '"login_step":"[^"]*"')  $(echo "$S"|grep -o '"login_running":[a-z]*')  $(echo "$S"|grep -o '"loggato":[a-z]*')"; echo "$S"|grep -q '"login_running":false' && break; done
echo "=== ESITO FINALE ==="; echo "$LAST_S" | sed 's/"url":"[^"]*"/"url":"<omesso>"/'
