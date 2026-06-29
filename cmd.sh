F=/opt/withus-backend/server/allianz-cattura.json
echo "=== dimensione + data ==="
ls -la "$F" 2>/dev/null
echo "=== riepilogo chiamate catturate ==="
python3 -c "
import json
d=json.load(open('$F'))
print('chiamate:', len(d))
for i,c in enumerate(d):
    u=(c.get('u') or '')
    # solo path
    p=u.split('?')[0]
    print(f'{i:>2} {c.get(\"m\"):4} {c.get(\"status\")} {p[-70:]}')
" 2>&1 | head -60
