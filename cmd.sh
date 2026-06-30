curl -s -m 15 "http://127.0.0.1:4200/pausakeepalive?min=60" >/dev/null 2>&1
echo "=== apro Sales+Motor ==="
curl -s -m 80 "http://127.0.0.1:4200/motor?step=open&wait=14000" >/dev/null 2>&1
echo "=== compilo e calcolo ==="
curl -s -m 90 "http://127.0.0.1:4200/motor?step=quote&targa=GY263BY&nascita=17/07/1993&calcola=1&wait=18000" 2>/dev/null | python3 -c "import sys,json
try:
  d=json.load(sys.stdin)
  t=d.get('target') or ''
  print('OFFERTA PRONTA' if 'legacyda' in t or 'offerta' in t else 'TARGET: '+t)
except Exception as e:
  print('quote err', e)" 2>/dev/null
echo "SNIFF ATTIVO"
