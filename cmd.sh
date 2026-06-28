echo "=== chiudo il modale errori ==="
curl -s --max-time 30 "http://127.0.0.1:4700/explore?click=CHIUDI" >/dev/null 2>&1
echo "=== campi data (placeholder gg/mm/aaaa) o etichetta 'acquisto' ==="
curl -s --max-time 45 "http://127.0.0.1:4700/explore" 2>/dev/null | python3 -c "import sys,json
d=json.load(sys.stdin)
for f in d.get('fields',[]):
 ph=f.get('placeholder','') or ''
 lbl=f.get('lbl','') or ''
 if 'aaaa' in ph.lower() or 'acquist' in lbl.lower() or 'acquist' in (f.get('id','') or '').lower():
  print(' id=',repr(f.get('id','')),'name=',repr(f.get('name','')),'req' if f.get('req') else '   ','val=',repr(f.get('val','')),'ph=',repr(ph),'lbl=',repr(lbl[:30]))
print('--- link che contengono acquisto ---',[l['t'] for l in d.get('links',[]) if 'acquist' in (l.get('t','') or '').lower()])"
