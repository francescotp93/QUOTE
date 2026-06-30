for i in $(seq 1 10); do H=$(git -C /opt/withus-backend rev-parse --short HEAD 2>/dev/null); [ "$H" = "7ab20c1" ] && break; sleep 8; done
echo "HEAD=$(git -C /opt/withus-backend rev-parse --short HEAD 2>/dev/null)"
sudo systemctl restart allianz-scraper.service 2>&1 || systemctl restart allianz-scraper.service 2>&1
for i in $(seq 1 13); do S=$(curl -s -m 8 "http://127.0.0.1:4200/status" 2>/dev/null); echo "$S" | grep -q '"loggato":true' && { echo PRONTO; break; }; sleep 8; done
curl -s -m 15 "http://127.0.0.1:4200/pausakeepalive?min=25" >/dev/null 2>&1
curl -s -m 80 "http://127.0.0.1:4200/motor?step=open&wait=14000" >/dev/null 2>&1
curl -s -m 80 "http://127.0.0.1:4200/motor?step=quote&targa=GY263BY&nascita=17/07/1993&calcola=1&wait=16000" >/dev/null 2>&1
echo "=== configura on=Infortuni ==="
curl -s -m 60 "http://127.0.0.1:4200/motor?step=configura&on=Infortuni&wait=11000" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('azioni:',d.get('azioni'))
for p in d.get('pages',[]):
  for f in p.get('frames',[]):
    if 'offerta' in f['url']: print('PREMIO/text:',f.get('texthead','')[:200])
" 2>/dev/null || echo fail
