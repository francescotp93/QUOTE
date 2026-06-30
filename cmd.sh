F=/opt/withus-backend/server/allianz-cattura.json
python3 -c "
import json,re
calls=json.load(open('$F'))
body=None
for c in calls:
  if 'offerta/sezioni' in c.get('url','') and c.get('kind')=='res' and c.get('body'): body=c['body']; break
if not body: print('no sezioni'); exit()
try: d=json.loads(body)
except: print('parse err'); exit()
for sez in d.get('sezioni',[]):
  print('== SEZIONE',sez.get('nome'),'id',sez.get('id'),'premio',sez.get('premio'))
  for g in sez.get('garanzie',[]):
    ar=g.get('areaRiservata') or {}
    pe=(ar.get('percentuale') or {}); im=(ar.get('importo') or {})
    print('  -',g.get('nome'),'| id',g.get('id'),'| premio',g.get('premio'),'| sel',(g.get('stato') or {}).get('selezionato'),'| AR% max_age',pe.get('massimoAge'),'imp max_age',im.get('massimoAge'))
print('--- cerco guida/massimale altrove ---')
for k in ['guida','massimale','rivals','infortun','conducente']:
  print(k, '→', len(re.findall(k, body, re.I)),'hit')
" 2>/dev/null || echo fail
