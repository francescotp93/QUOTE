set +e
BASE="provincia=TP&tipo=1&mq=2&dimora=1&piano=2&cc=2&eta=5"
for attempt in 1 2 3; do
  echo "== tentativo $attempt =="
  OUT=$(curl -s --max-time 90 "http://127.0.0.1:4400/premio-casa?$BASE&debug=1")
  echo "$OUT" | python3 -c "
import sys,json
try: d=json.load(sys.stdin)
except: print('parse fail'); sys.exit()
print('ok',d.get('ok'),'lordo',d.get('premio_totale'),'err',(d.get('error') or '')[:120])
if d.get('ok'):
    print('top_keys:', d.get('top_keys'))
    diag=d.get('diagnostica',[])
    print('trovati',len(diag),'campi minimo/deroga/sconto:')
    for x in diag[:60]: print('  ',x['campo'],'=',x['valore'])
" 2>&1
  echo "$OUT" | grep -q '"ok": true' && break
  sleep 15
done
echo "---fine---"
