echo "=== clic sul link 'Data acquisto veicolo' ==="
curl -s --max-time 30 "http://127.0.0.1:4700/explore?click=Data%20acquisto%20veicolo" 2>/dev/null | python3 -c "import sys,json
d=json.load(sys.stdin)
print('campi data/acquisto dopo il clic:')
for f in d.get('fields',[]):
 ph=(f.get('placeholder','') or '').lower(); lbl=(f.get('lbl','') or '')
 if 'aaaa' in ph or 'acquist' in lbl.lower() or 'acquist' in (f.get('id','') or '').lower():
  print('  id=',repr(f.get('id','')),'val=',repr(f.get('val','')),'lbl=',repr(lbl[:30]))" 2>/dev/null
echo "=== screenshot ==="
R=$(curl -s --max-time 25 "http://127.0.0.1:4700/shot?b64=1&q=18"); LEN=$(printf '%s' "$R"|wc -c)
echo "chars:$LEN"; [ "$LEN" -lt 92000 ] && printf '%s' "$R" || echo TOO_BIG
