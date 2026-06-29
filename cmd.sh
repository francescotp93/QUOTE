echo "start $(date +%T) — HDI /premio sul nuovo server"
curl -s --max-time 175 "http://127.0.0.1:4400/premio?targa=GY263BY&nascita=17%2F07%2F1993" 2>/dev/null | python3 -c "import sys,json
d=json.load(sys.stdin); print('ok:',d.get('ok'),'premio:',d.get('premio_annuale'))
lg=d.get('log',[]); print('LOG:'); [print('  ',x) for x in (lg[-8:] if isinstance(lg,list) else [])]" 2>/dev/null
echo "end $(date +%T)"
