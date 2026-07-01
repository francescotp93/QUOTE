set +e
sleep 25
sudo systemctl restart hdi-scraper.service 2>&1; echo "rc=$?"
sleep 35
BASE="provincia=TP&tipo=1&mq=2&dimora=1&piano=2&cc=2&eta=5"
FULL="081035,081036,081278,081279,081280,081281,081282,081283,081284,091202,131065,135032,131067,131068,181009"
for code in 000001 000002 000003 000004 000006 000012; do
  echo "== frazcode $code =="
  curl -s --max-time 90 "http://127.0.0.1:4400/premio-casa?$BASE&garanzie=$FULL&frazcode=$code&debug=1" | python3 -c "
import sys,json
try: d=json.load(sys.stdin)
except: print('  parse fail'); sys.exit()
print('  ok',d.get('ok'),'lordo',d.get('premio_totale'),'err',(d.get('error') or '')[:80])
for x in d.get('rate',[])[:12]:
    v=str(x['valore'])
    if v not in ('0','0,00','0.0','',None,'null'): print('   ',x['campo'],'=',x['valore'])
" 2>&1
done
echo "---fine---"
