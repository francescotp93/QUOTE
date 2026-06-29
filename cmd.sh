echo "HDI loggato? $(curl -s --max-time 12 http://127.0.0.1:4400/status | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("loggato"))' 2>/dev/null)"
echo "start $(date +%T) — HDI /premio GY263BY"
curl -s --max-time 200 "http://127.0.0.1:4400/premio?targa=GY263BY&nascita=17%2F07%2F1993" 2>/dev/null | head -c 500
echo; echo "end $(date +%T)"
