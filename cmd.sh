F=/opt/withus-backend/server/allianz-cattura.json
python3 -c "
import json
d=json.load(open('$F'))
print('n elementi:', len(d))
print('chiavi 1° elem:', list(d[0].keys()) if d else 'vuoto')
print('--- TUTTI gli URL (path) catturati ---')
from collections import Counter
def url(x): return x.get('u') or x.get('url') or ''
def meth(x): return x.get('m') or x.get('method') or ''
seen=Counter()
for x in d:
    u=url(x).split('?')[0]
    seen[(meth(x),u[-60:])]+=1
for (m,u),c in seen.most_common(40):
    print(f'  {c:>2} {m:5} {u}')
"
