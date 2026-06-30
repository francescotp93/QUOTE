for i in $(seq 1 12); do curl -s --max-time 5 http://127.0.0.1:4200/status | grep -q loggato && break; sleep 3; done
curl -s --max-time 8 "http://127.0.0.1:4200/pausakeepalive?min=20" >/dev/null
curl -s --max-time 8 "http://127.0.0.1:4200/sniff/start" >/dev/null
echo "=== cerco 'preventivatore Motor' nella barra Matrix ==="
curl -s --max-time 45 "http://127.0.0.1:4200/explore?goto=/matrix/&type=preventivatore%20Motor&enter=1&wait=8000" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('url:',(d.get('url') or '')[:100],'| frame:',d.get('nframes'))
for f in (d.get('frames') or []):
    ll=f.get('links') or []; ff=f.get('fields') or []
    if ll: print('  link:', ' · '.join(ll[:22]))
    if ff: print('  campi:', [ (x.get('id') or x.get('name') or x.get('ph') or x.get('type')) for x in ff[:12] ])
" 2>&1 | head -14
echo "=== sniff OFF: nuove operazioni graphql (non dashboard) ==="
curl -s --max-time 15 "http://127.0.0.1:4200/sniff/stop" >/dev/null 2>&1
python3 -c "
import json
d=json.load(open('/opt/withus-backend/server/allianz-cattura.json'))
DASH={'userDetails','expiringPassword','getFiltersByUsernameAndArea','getMyInfoUserRoleAndKey','getOperationAccount','getCheckedBookmarks','frontendExternalVariables','getPopupList','getIncidentList','getShortcuts','meetingList','getNotificationCategories','notifications','getWidgetsResults','getInfoUser','getSearchResults','search'}
for x in d:
    if x.get('kind')!='req' or 'graphql' not in (x.get('url') or ''): continue
    try:
        j=json.loads(x.get('body') or '{}'); n=j.get('operationName')
        if n and n not in DASH: print('OP:',n,'| vars:',json.dumps(j.get('variables'),ensure_ascii=False)[:160])
    except: pass
"
