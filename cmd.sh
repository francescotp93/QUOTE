echo "=== compilo CF avente diritto (campo 2CFPI) ==="
curl -s --max-time 35 "http://127.0.0.1:4700/explore?fill=DDOFNC93L17D423L&fillsel=%5Bid%3D%222CFPI%22%5D" 2>/dev/null | python3 -c "import sys,json
d=json.load(sys.stdin)
for f in d.get('fields',[])[:6]: print('field',f.get('id'),'val=',f.get('value','?'))" 2>/dev/null || echo "(dump senza value)"
echo "--- ora TROVA + cattura ---"
curl -s --max-time 50 "http://127.0.0.1:4700/explore?click=TROVA&sniff=1" 2>/dev/null | python3 -c "import sys,json
d=json.load(sys.stdin)
print('TEXT:',d.get('text','')[:600])
print('LINKS:',[l['t'] for l in d.get('links',[]) if l['t'] and l['t'] not in ('0','N.A.','N.D.')][:40])
for c in d.get('captured',[]):
 u=c.get('url','')
 if 'version.json' in u: continue
 print(' ',c.get('k'),c.get('m'),c.get('s',''),u[:130])
 b=str(c.get('body',''))
 if c.get('k')=='res' and b[:1] in '{[': print('    body:',b[:350])"
