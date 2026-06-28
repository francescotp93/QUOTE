cd /opt/withus-backend
LAST=$(git rev-parse origin/claude/vibrant-tesla-o0glfd 2>/dev/null|cut -c1-7)
for i in $(seq 1 25); do git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null; [ "$(git rev-parse HEAD|cut -c1-7)" = "$LAST" ] && { echo "deploy ok $LAST"; break; }; sleep 6; done
sleep 18
echo "dump arricchito attivo? $(grep -c 'req: !!' scraper/axa/quote-service.mjs)"
echo "=== campi obbligatori/compilati nella schermata attuale ==="
curl -s --max-time 45 "http://127.0.0.1:4700/explore" 2>/dev/null | python3 -c "import sys,json
d=json.load(sys.stdin)
print('TEXT:',d.get('text','')[:300])
print('--- FIELDS (id | req | val | label) ---')
for f in d.get('fields',[]):
 if f.get('id') or f.get('req') or f.get('val') or (f.get('lbl') and f.get('lbl')!=''):
  print(' ',f.get('id','')[:18].ljust(18),'REQ' if f.get('req') else '   ','val=',repr(f.get('val','')),'|',f.get('lbl','')[:28])
print('--- BTN ---',[l['t'] for l in d.get('links',[]) if l['t'] and l['t'] not in ('0','N.A.','N.D.','CRM','DANNI','VITA','VITA PROTECTION','INCASSI','SINISTRI','INCENTIX')][:30])"
