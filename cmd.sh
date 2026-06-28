echo "=== ispezione schermata avente-diritto attuale (campi con valore/obbligo + bottoni) ==="
curl -s --max-time 45 "http://127.0.0.1:4700/explore" 2>/dev/null | python3 -c "import sys,json
d=json.load(sys.stdin)
print('TEXT(full):',d.get('text','')[:560])
print('--- FIELDS (id|req|val|lbl) ---')
for f in d.get('fields',[]):
 if f.get('id') or f.get('req') or f.get('val'):
  print(' ',(f.get('id') or '?')[:16].ljust(16),'R' if f.get('req') else ' ','val='+repr(f.get('val',''))[:24].ljust(24),'|',f.get('lbl','')[:26])
print('--- BTN ---',[l['t'] for l in d.get('links',[]) if l['t'] and l['t'] not in ('0','N.A.','N.D.','CRM','DANNI','VITA','VITA PROTECTION','INCASSI','SINISTRI','INCENTIX')][:30])"
