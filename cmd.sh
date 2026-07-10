set +e
echo "=== HDI /casaprobe → estraggo l'elenco prodotti vendibili ==="
curl -s --max-time 70 http://127.0.0.1:4400/casaprobe > /tmp/hdi_probe.json 2>&1
echo "dim risposta: $(wc -c < /tmp/hdi_probe.json) byte"
python3 - <<'PY'
import json
try:
    d=json.load(open('/tmp/hdi_probe.json'))
except Exception as e:
    print('parse fail:',e); print(open('/tmp/hdi_probe.json').read()[:800]); raise SystemExit
prod=(d.get('prodotti') or {})
j=prod.get('json')
print('getProdottiVendibili status:',prod.get('status'),'len:',prod.get('len'))
# la lista puo' essere in vari campi: normalizzo
def walk(x, path=''):
    items=[]
    if isinstance(x,list):
        for i,v in enumerate(x): items+=walk(v,path)
    elif isinstance(x,dict):
        # se ha campi tipo idProdotto/codiceProdotto/descrizione → e' un prodotto
        keys={k.lower():k for k in x.keys()}
        if any('prodotto' in k or 'descriz' in k or 'linea' in k for k in keys):
            items.append(x)
        for v in x.values(): items+=walk(v,path)
    return items
items=walk(j)
seen=set(); uniq=[]
for it in items:
    key=json.dumps(it,sort_keys=True)[:120]
    if key in seen: continue
    seen.add(key); uniq.append(it)
print('prodotti trovati:',len(uniq))
for it in uniq[:60]:
    # stampa campi chiave
    kv={k:v for k,v in it.items() if isinstance(v,(str,int,float)) and ('prodotto' in k.lower() or 'descriz' in k.lower() or 'linea' in k.lower() or 'codice' in k.lower() or 'nome' in k.lower())}
    s=json.dumps(kv,ensure_ascii=False)
    if any(w in s.lower() for w in ['moto','ciclo','due ruote','2 ruote','scooter']):
        print('  >>> MOTO?  ',s)
    else:
        print('        ',s[:140])
PY
echo "---fine---"
