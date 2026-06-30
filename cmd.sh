# riarmo offerta Allianz per cattura click utente
curl -s -m 15 "http://127.0.0.1:4200/pausakeepalive?min=60" >/dev/null 2>&1
# azzera sniffer (stop salva e svuota) poi riparte pulito
curl -s -m 15 "http://127.0.0.1:4200/sniff/stop"  >/dev/null 2>&1
curl -s -m 15 "http://127.0.0.1:4200/sniff/start" >/dev/null 2>&1
echo "=== stato pagina ==="
curl -s -m 60 "http://127.0.0.1:4200/motor?step=probe&wait=4000" 2>/dev/null | python3 -c "import sys,json
try:
  d=json.load(sys.stdin)
  print('TARGET:', d.get('target'))
except Exception as e:
  print('probe err', e)" 2>/dev/null
echo "SNIFF RIAVVIATO PULITO"
