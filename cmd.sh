cd /opt/withus-backend
LAST=$(git rev-parse origin/claude/vibrant-tesla-o0glfd 2>/dev/null|cut -c1-7)
for i in $(seq 1 8); do git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null; [ "$(git rev-parse HEAD|cut -c1-7)" = "$LAST" ] && { echo "deploy ok $LAST"; break; }; sleep 6; done
sleep 10
echo "AXA pre-test: $(curl -s --max-time 12 http://127.0.0.1:4700/status | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("login_step"),d.get("loggato"))' 2>/dev/null)"
echo "start $(date +%T) — /premio (deve auto-rilogarsi e quotare)"
curl -s --max-time 215 "http://127.0.0.1:4700/premio?targa=GY263BY&cf=DDOFNC93L17D423L&cognome=ODDO&nome=FRANCESCO&data_nascita=17%2F07%2F1993" 2>/dev/null
echo; echo "end $(date +%T)"
