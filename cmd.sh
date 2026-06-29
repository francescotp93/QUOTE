F=/opt/withus-backend/server/allianz-cattura.json
echo "=== file: data + dimensione ==="
ls -la "$F" 2>/dev/null
echo "=== è il mio test o una cattura vera? ==="
python3 -c "
import json
d=json.load(open('$F'))
print('elementi:', len(d) if isinstance(d,list) else 'non-lista')
real=[x for x in d if isinstance(x,dict) and '/matrix/test/' not in (x.get('u') or '')]
print('chiamate reali (non test):', len(real))
for c in real[:40]:
    u=(c.get('u') or '').split('?')[0]
    print(' ', c.get('m') or '', c.get('status'), u[-72:])
" 2>&1 | head -50
