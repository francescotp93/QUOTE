echo "=== TEST meccanismo cattura (navigando il browser del server) ==="
sleep 70  # attendo redeploy allianz
echo "--- ITALIANA (loggata, filtro ampio): start -> naviga /auto -> stop"
curl -s --max-time 10 "http://127.0.0.1:4300/sniff/start" >/dev/null
curl -s --max-time 45 "http://127.0.0.1:4300/explore?goto=/auto&wait=5000" >/dev/null 2>&1
curl -s --max-time 15 "http://127.0.0.1:4300/sniff/stop" 2>/dev/null | python3 -c "import sys,json
try: d=json.load(sys.stdin)
except: print('  parse err'); sys.exit()
print('  captured:',d.get('captured'),'| plurimaCalls:',d.get('plurimaCalls'),'| calls:',len(d.get('calls') or []))
for c in (d.get('calls') or [])[:5]: print('    ',c.get('kind'),c.get('method'),(c.get('url') or '')[:90])"
echo "--- ALLIANZ (loggata, filtro ora ampio): start -> naviga /matrix/ -> stop"
curl -s --max-time 10 "http://127.0.0.1:4200/sniff/start" >/dev/null
curl -s --max-time 45 "http://127.0.0.1:4200/explore?goto=https://portaleagenzie.allianz.it/matrix/&wait=6000" >/dev/null 2>&1
curl -s --max-time 15 "http://127.0.0.1:4200/sniff/stop" 2>/dev/null | python3 -c "import sys,json
try: d=json.load(sys.stdin)
except: print('  parse err'); sys.exit()
print('  captured:',d.get('captured'),'| calls:',len(d.get('calls') or []))
for c in (d.get('calls') or [])[:6]: print('    ',c.get('kind'),c.get('method'),(c.get('url') or '')[:90])"
