echo "=== clic CONFERMA FATTORI + cattura ==="
curl -s --max-time 50 "http://127.0.0.1:4700/explore?click=CONFERMA%20FATTORI&sniff=1" 2>/dev/null | python3 -c "import sys,json
try:
 d=json.load(sys.stdin)
 print('TEXT:',d.get('text','')[:500])
 print('LINKS:',[l['t'] for l in d.get('links',[]) if l['t'] and l['t'] not in ('0','N.A.','N.D.')][:40])
 print('CAPTURED:')
 for c in d.get('captured',[]):
  u=c.get('url',''); 
  if 'version.json' in u: continue
  print(' ',c.get('k'),c.get('m'),c.get('s',''),u[:120])
  b=str(c.get('body',''))
  if c.get('k')=='res' and b and b[0] in '{[': print('     body:',b[:400])
except Exception as e: print('PARSE ERR',e); print(sys.stdin.read()[:1500])"
