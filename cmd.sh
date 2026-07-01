set +e
echo "== attendo autopull (25s) + restart hdi-scraper =="
sleep 25
sudo systemctl restart hdi-scraper.service 2>&1; echo "rc=$?"
sleep 35
BASE="provincia=TP&tipo=1&mq=2&dimora=1&piano=2&cc=2&eta=5"
echo "== DEBUG: campi minimo/deroga/sconto nella risposta HDI =="
curl -s --max-time 90 "http://127.0.0.1:4400/premio-casa?$BASE&debug=1" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('ok',d.get('ok'),'lordo',d.get('premio_totale'),'netto',d.get('netto_totale_num'),'imposte',d.get('imposte_totale_num'))
print('top_keys:', d.get('top_keys'))
diag=d.get('diagnostica',[])
print('trovati',len(diag),'campi:')
for x in diag[:60]: print('  ',x['campo'],'=',x['valore'])
" 2>&1
echo "---fine---"
