for i in $(seq 1 10); do H=$(git -C /opt/withus-backend rev-parse --short HEAD 2>/dev/null); [ "$H" = "2761ef2" ] && break; sleep 8; done
echo "HEAD=$(git -C /opt/withus-backend rev-parse --short HEAD 2>/dev/null)"
sudo systemctl restart allianz-scraper.service 2>&1 || systemctl restart allianz-scraper.service 2>&1
for i in $(seq 1 13); do S=$(curl -s -m 8 "http://127.0.0.1:4200/status" 2>/dev/null); echo "$S" | grep -q '"loggato":true' && { echo PRONTO; break; }; sleep 8; done
curl -s -m 15 "http://127.0.0.1:4200/pausakeepalive?min=45" >/dev/null 2>&1
echo "--- open ---"
curl -s -m 80 "http://127.0.0.1:4200/motor?step=open&sniff=1&wait=15000" 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);print('open ok' if any('assuntivomotor' in f['url'] for p in d.get('pages',[]) for f in p.get('frames',[])) else 'open NO')" 2>/dev/null
echo "--- quote+calcola ---"
curl -s -m 80 "http://127.0.0.1:4200/motor?step=quote&targa=GY263BY&nascita=17/07/1993&calcola=1&wait=18000" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
for p in d.get('pages',[]):
  for f in p.get('frames',[]):
    if 'assuntivomotor' in f['url']:
      print('URL',f['url'][-40:]); print('TEXT',f.get('texthead','')[:260])
" 2>/dev/null
