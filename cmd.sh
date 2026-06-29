F=/opt/withus-backend/server/allianz-cattura.json
python3 -c "
import json
d=json.load(open('$F'))
gql=[x for x in d if x.get('kind')=='req' and 'graphql' in (x.get('url') or '')]
print('graphql req:', len(gql))
DASH={'userDetails','expiringPassword','getFiltersByUsernameAndArea','getMyInfoUserRoleAndKey','getOperationAccount','getCheckedBookmarks','frontendExternalVariables','getPopupList','getIncidentList','getShortcuts','meetingList','getNotificationCategories','notifications','getWidgetsResults','getInfoUser'}
for x in gql:
    try:
        j=json.loads(x.get('body') or '{}'); n=j.get('operationName') or '(anon)'
    except Exception as e: n='(parse:'+str(e)[:20]+')'
    print(('  >>> ' if n not in DASH else '      ')+str(n))
"
