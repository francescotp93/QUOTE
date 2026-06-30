curl -s -m 15 "http://127.0.0.1:4200/pausakeepalive?min=45" >/dev/null 2>&1
curl -s -m 15 "http://127.0.0.1:4200/sniff/start" >/dev/null 2>&1
curl -s -m 80 "http://127.0.0.1:4200/motor?step=open&wait=14000" >/dev/null 2>&1
echo "=== offerta pronta? ==="
curl -s -m 80 "http://127.0.0.1:4200/motor?step=quote&targa=GY263BY&nascita=17/07/1993&calcola=1&wait=16000" 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);print('OFFERTA PRONTA' if 'offerta' in (d.get('target') or '') else d.get('target'))" 2>/dev/null
echo "SNIFF ATTIVO"
