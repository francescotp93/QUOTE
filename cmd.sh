F=/opt/withus-backend/server/allianz-cattura.json
echo "=== corpi chiamate chiave Motor ==="
python3 -c "
import json
calls=json.load(open('$F'))
def show(pred,label,maxb=1800):
  for c in calls:
    u=c.get('url','')
    if pred(u) and c.get('body'):
      print('### ',label,c.get('kind'),c.get('method'),c.get('status',''),u.split('/assuntivomotor')[-1][:80])
      print(c['body'][:maxb]); print('---'); return
show(lambda u:'/quote/api/dati-quotazione' in u and 'controlli' not in u and 'res' , 'MODELLO')
for c in calls:
  if '/controlli/Targa' in c.get('url','') and c.get('kind')=='res' and c.get('body'):
    print('### TARGA-RES'); print(c['body'][:2200]); print('---'); break
for c in calls:
  if '/controlli/Targa' in c.get('url','') and c.get('kind')=='req' and c.get('body'):
    print('### TARGA-REQ'); print(c['body'][:800]); print('---'); break
for c in calls:
  if '/controlli/Calcola' in c.get('url','') and c.get('kind')=='res' and c.get('body'):
    print('### CALCOLA-400'); print(c['body'][:1500]); print('---'); break
" 2>/dev/null || echo "(parse fail)"
