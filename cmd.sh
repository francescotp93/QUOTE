echo "=== stato login ==="
for p in 4500:groupama 4700:axa; do port=${p%%:*}; nm=${p##*:}; echo "  $nm: $(curl -s --max-time 12 http://127.0.0.1:$port/status | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("login_step"),"loggato="+str(d.get("loggato")))' 2>/dev/null)"; done
echo "start $(date +%T) — AXA /premio GY263BY"
curl -s --max-time 200 "http://127.0.0.1:4700/premio?targa=GY263BY&cf=DDOFNC93L17D423L&cognome=ODDO&nome=FRANCESCO&data_nascita=17%2F07%2F1993" 2>/dev/null
echo; echo "end $(date +%T)"
