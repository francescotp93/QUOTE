cd /opt/withus-backend
LAST=$(git rev-parse origin/claude/vibrant-tesla-o0glfd 2>/dev/null|cut -c1-7)
for i in $(seq 1 9); do git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null; [ "$(git rev-parse HEAD|cut -c1-7)" = "$LAST" ] && { echo "deploy ok $LAST"; break; }; sleep 6; done
echo "ensurePage nel keepalive? $(grep -c 'CHIAVE: se la pagina' scraper/hdi/quote-service.mjs)"
sleep 14
echo "HDI loggato? $(curl -s --max-time 12 http://127.0.0.1:4400/status | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("loggato"))' 2>/dev/null)"
echo "start $(date +%T) — HDI /premio GY263BY"
curl -s --max-time 190 "http://127.0.0.1:4400/premio?targa=GY263BY&nascita=17%2F07%2F1993" 2>/dev/null | python3 -c "import sys,json
d=json.load(sys.stdin); print('ok:',d.get('ok'),'premio:',d.get('premio_annuale')); 
lg=d.get('log',[]); print('LOG:'); 
[print('  ',x) for x in (lg[-12:] if isinstance(lg,list) else [lg])]" 2>/dev/null
echo "end $(date +%T)"
