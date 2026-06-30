for i in $(seq 1 10); do curl -s --max-time 5 http://127.0.0.1:4200/status | grep -q loggato && break; sleep 3; done
curl -s --max-time 8 "http://127.0.0.1:4200/pausakeepalive?min=20" >/dev/null
curl -s --max-time 8 "http://127.0.0.1:4200/sniff/start" >/dev/null
echo "=== digito + clicco 'Motor' ==="
curl -s --max-time 50 "http://127.0.0.1:4200/explore?goto=/matrix/&type=preventivatore%20motor&click=Motor&wait=9000" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('url DOPO:',(d.get('url') or '')[:110])
for f in (d.get('frames') or []):
    ll=[x for x in (f.get('links') or []) if x.strip()]; ff=f.get('fields') or []
    if ll: print('  voci:', ' · '.join(ll[:22]))
    if ff: print('  campi:', [ (x.get('id') or x.get('name') or x.get('ph') or x.get('type')) for x in ff[:12] ])
" 2>&1 | head -12
echo "=== graphql nuove ==="
curl -s --max-time 15 "http://127.0.0.1:4200/sniff/stop" >/dev/null 2>&1
python3 -c "
import json
d=json.load(open('/opt/withus-backend/server/allianz-cattura.json'))
DASH={'userDetails','expiringPassword','getFiltersByUsernameAndArea','getMyInfoUserRoleAndKey','getOperationAccount','getCheckedBookmarks','frontendExternalVariables','getPopupList','getIncidentList','getShortcuts','meetingList','getNotificationCategories','notifications','getWidgetsResults','getInfoUser','globalSearch','getGlobalSearch'}
seen=set()
for x in d:
    if x.get('kind')!='req' or 'graphql' not in (x.get('url') or ''): continue
    try:
        j=json.loads(x.get('body') or '{}'); n=j.get('operationName')
        if n and n not in DASH and n not in seen: seen.add(n); print(' OP:',n)
    except: pass
"
