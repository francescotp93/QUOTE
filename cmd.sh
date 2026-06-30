F=/opt/withus-backend/server/allianz-cattura.json
python3 -c "
import json
calls=json.load(open('$F'))
def show(sub,maxb):
  for c in calls:
    if sub in c.get('url','') and c.get('kind')=='res' and c.get('body'):
      print('### '+sub+' ('+str(len(c['body']))+'b)'); print(c['body'][:maxb]); print(); return
  print('### '+sub+' (vuoto)')
show('offerta/interruttori',1500)
show('offerta/sezioni',2000)
show('offerta/impostazioni-generali',1200)
show('offerta/optional-pacchetti',1200)
" 2>/dev/null || echo fail
