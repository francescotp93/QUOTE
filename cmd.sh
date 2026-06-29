F=/opt/withus-backend/server/allianz-cattura.json
echo "=== file ==="; ls -la "$F" 2>/dev/null
python3 -c "
import json,re
raw=open('$F').read()
try: d=json.loads(raw)
except Exception as e:
    print('JSON non valido:',e); print(raw[:300]); import sys; sys.exit()
print('elementi catturati:', len(d) if isinstance(d,list) else type(d).__name__)
reqs=[x for x in d if isinstance(x,dict) and x.get('m') and 'graphql' in (x.get('u') or x.get('url') or '')]
print('richieste graphql:', len(reqs))
print('--- SEQUENZA operationName (in ordine) ---')
DASH={'userDetails','expiringPassword','getFiltersByUsernameAndArea','getMyInfoUserRoleAndKey','getOperationAccount','getCheckedBookmarks','frontendExternalVariables','getPopupList','getIncidentList','getShortcuts','meetingList','getNotificationCategories','notifications','getWidgetsResults'}
for x in reqs:
    b=x.get('body') or ''
    try:
        j=json.loads(b); n=j.get('operationName') or '(anon)'
    except: n='(parse-err)'
    tag='' if n in DASH else '  <<<'
    print(' ',n,tag)
" 2>&1 | head -80
