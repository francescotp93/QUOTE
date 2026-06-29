echo "=== /hubveicolo GY263BY Rinnovo: proprietario + allestimenti ==="
curl -s --max-time 90 "http://127.0.0.1:4300/hubveicolo?targa=GY263BY&situazione=Rinnovo" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('ok:', d.get('ok'))
v=d.get('veicolo') or {}
print('--- veicolo base ---')
print('marca:',v.get('marca'),'| modello:',v.get('modello'),'| allestimento:',v.get('allestimento'))
al=v.get('allestimenti')
print('--- allestimenti (',len(al) if al else 0,') ---')
for a in (al or [])[:15]: print('  ', a)
print('--- proprietario ---')
print(json.dumps(d.get('proprietario'), ensure_ascii=False, indent=1)[:1500])
print('--- contraente ---')
print(json.dumps(d.get('contraente'), ensure_ascii=False, indent=1)[:800])
"
