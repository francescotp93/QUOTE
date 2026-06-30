curl -s -m 15 "http://127.0.0.1:4200/pausakeepalive?min=45" >/dev/null 2>&1
curl -s -m 15 "http://127.0.0.1:4200/sniff/start" >/dev/null 2>&1
echo "--- riapro offerta GY263BY (pronta sul VNC) ---"
curl -s -m 80 "http://127.0.0.1:4200/motor?step=open&wait=14000" 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);print('form aperto' if any('assuntivomotor' in f['url'] for p in d.get('pages',[]) for f in p.get('frames',[])) else 'NO')" 2>/dev/null
curl -s -m 80 "http://127.0.0.1:4200/motor?step=quote&targa=GY263BY&nascita=17/07/1993&calcola=1&wait=18000" 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);print('offerta:', d.get('target'))" 2>/dev/null
echo "SNIFF ATTIVO — l'utente puo' configurare sul VNC"
