set +e
sleep 25
sudo systemctl restart hdi-scraper.service 2>&1; echo "rc=$?"
sleep 35
echo "== TCM: capitale 150000, durata 30, nascita 17/07/1993, fumatore, mensile (atteso 488,04) =="
curl -s --max-time 120 "http://127.0.0.1:4400/premio-tcm?capitale=150000&durata=30&nascita=17/07/1993&eta=33&fumatore=1&frazcode=8" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('ok',d.get('ok'),'premio_lordo',d.get('premio_lordo'),'caric',d.get('caricamento'),'err',d.get('error'))
print('trace:')
for t in d.get('trace',[]): print('   ',t['step'],'->',t['status'],'len',t['len'])
if d.get('snippet'): print('snippet:', d.get('snippet')[:300])
" 2>&1
echo "---fine---"
