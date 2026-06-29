F=/opt/withus-backend/server/allianz-cattura.json
python3 -c "
import json,re
d=json.load(open('$F'))
reqs=[x for x in d if x.get('kind')=='req' and 'graphql' in (x.get('url') or '')]
print('richieste graphql:', len(reqs))
ops=[]
for r in reqs:
    b=r.get('body') or ''
    try:
        j=json.loads(b)
        name=j.get('operationName') or '(anon)'
        q=(j.get('query') or '')[:80].replace(chr(10),' ')
        ops.append((name,q))
    except Exception as e:
        ops.append(('PARSE-ERR', b[:80]))
from collections import Counter
print('--- operationName (conteggio) ---')
for n,c in Counter([o[0] for o in ops]).most_common(): print(f'  {c:>2}  {n}')
print('--- esempio query per nome ---')
seen=set()
for n,q in ops:
    if n in seen: continue
    seen.add(n); print(f'  [{n}] {q}')
"
