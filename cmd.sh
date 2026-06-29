systemctl start withus-autopull.service 2>/dev/null || true
for i in $(seq 1 24); do git -C /opt/withus-backend log --oneline -1 2>/dev/null | grep -q "digitazione" && break; sleep 5; done
echo "commit: $(git -C /opt/withus-backend log --oneline -1 2>/dev/null)"
for i in $(seq 1 15); do curl -s --max-time 5 http://127.0.0.1:4200/status | grep -q loggato && break; sleep 3; done
curl -s --max-time 8 "http://127.0.0.1:4200/pausakeepalive?min=15" >/dev/null
curl -s --max-time 8 "http://127.0.0.1:4200/sniff/start" >/dev/null
echo "=== cerco 'ODDO FRANCESCO' nella barra Matrix ==="
curl -s --max-time 40 "http://127.0.0.1:4200/explore?goto=/matrix/&type=ODDO%20FRANCESCO&enter=1&wait=6000" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('url:',(d.get('url') or '')[:80],'frame:',d.get('nframes'))
for f in (d.get('frames') or []):
    ll=f.get('links') or []; ff=f.get('fields') or []
    if ll: print('  link:', ' · '.join(ll[:18]))
    if ff: print('  campi:', [x.get('id') or x.get('name') or x.get('ph') for x in ff[:8]])
" 2>&1 | head -12
echo "=== sniff OFF: operazioni graphql del search ==="
curl -s --max-time 15 "http://127.0.0.1:4200/sniff/stop" >/dev/null 2>&1
python3 -c "
import json
d=json.load(open('/opt/withus-backend/server/allianz-cattura.json'))
for x in d:
    if x.get('kind')!='req' or 'graphql' not in (x.get('url') or ''): continue
    try:
        j=json.loads(x.get('body') or '{}'); n=j.get('operationName')
        if n and n not in ('userDetails','expiringPassword','getFiltersByUsernameAndArea'):
            print('OP:',n,'| vars:',json.dumps(j.get('variables'),ensure_ascii=False)[:200])
    except: pass
"
