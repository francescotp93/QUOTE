F=/opt/withus-backend/server/allianz-cattura.json
python3 -c "
import json
calls=json.load(open('$F'))
def show(sub,maxb):
  for c in calls:
    if sub in c.get('url','') and c.get('kind')=='res' and c.get('body'):
      print('### '+sub); print(c['body'][:maxb]); print(); return
  print('### '+sub+' (vuoto)')
show('offerta/sintesi-offerta',2500)
show('offerta/soluzioni',2500)
" 2>/dev/null || echo "(fail)"
