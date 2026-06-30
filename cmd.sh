echo "=== ALLIANZ: cattura guidata Matrix (cerca 'preventivatore Motor') ==="
sleep 70  # attendo redeploy allianz (sniff ampio + buffer completo)
curl -s --max-time 8 "http://127.0.0.1:4200/status" | head -c 160; echo
echo "--- start sniff"
curl -s --max-time 10 "http://127.0.0.1:4200/sniff/start" >/dev/null
echo "--- navigo matrix + cerco 'preventivatore Motor' + invio"
curl -s --max-time 50 "http://127.0.0.1:4200/explore?goto=https://portaleagenzie.allianz.it/matrix/&type=preventivatore%20Motor&enter=1&wait=8000" >/dev/null 2>&1
sleep 3
echo "--- stop sniff (cosa ha catturato)"
curl -s --max-time 20 "http://127.0.0.1:4200/sniff/stop" 2>/dev/null | python3 -c "
import sys,json
try: d=json.load(sys.stdin)
except: print('parse err'); sys.exit()
calls=d.get('calls') or []
print('captured:',d.get('captured'),'| calls:',len(calls))
import re
for c in calls[:14]:
  u=(c.get('url') or '')
  op=''
  b=c.get('body') or ''
  m=re.search(r'operationName\"?\s*[:=]\s*\"?([A-Za-z0-9_]+)', b)
  if m: op='  op='+m.group(1)
  print(' ',c.get('kind'),c.get('method'),u[:70],op)
"
