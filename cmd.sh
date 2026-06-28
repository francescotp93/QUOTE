cd /opt/withus-backend
LAST=$(git rev-parse origin/claude/vibrant-tesla-o0glfd 2>/dev/null|cut -c1-7)
for i in $(seq 1 9); do git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null; [ "$(git rev-parse HEAD|cut -c1-7)" = "$LAST" ] && { echo "deploy ok $LAST"; break; }; sleep 6; done
sleep 12
echo "=== /premio SENZA data_acquisto (con DEBUG) ==="
curl -s --max-time 210 "http://127.0.0.1:4700/premio?targa=GY263BY&cf=DDOFNC93L17D423L&cognome=ODDO&nome=FRANCESCO&data_nascita=17%2F07%2F1993" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok:',d.get('ok')); print('dbg:',d.get('dbg')); print('err:',d.get('error',''))" 2>/dev/null
echo
