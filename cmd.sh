for i in $(seq 1 10); do H=$(git -C /opt/withus-backend rev-parse --short HEAD 2>/dev/null); [ "$H" = "0169db8" ] && break; sleep 8; done
echo "HEAD=$(git -C /opt/withus-backend rev-parse --short HEAD 2>/dev/null)"
sudo systemctl restart allianz-scraper.service 2>&1 || systemctl restart allianz-scraper.service 2>&1
for i in $(seq 1 14); do S=$(curl -s -m 8 "http://127.0.0.1:4200/status" 2>/dev/null); echo "$S" | grep -q '"loggato":true' && { echo PRONTO; break; }; sleep 8; done
curl -s -m 15 "http://127.0.0.1:4200/pausakeepalive?min=30" >/dev/null 2>&1
echo "=== /motor step=open ==="
curl -s -m 90 "http://127.0.0.1:4200/motor?step=open&sniff=1&wait=16000" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('npages',d.get('npages'),'target',d.get('target'))
for p in d.get('pages',[]):
  for f in p.get('frames',[]):
    print('--- frame',f['url'][:90],'bodylen',f['bodylen'])
    print('  fields:',[ (x['id'] or x['name'] or x['ph']) for x in f['fields']][:25])
    print('  texthead:',f.get('texthead','')[:300])
" 2>/dev/null || echo "(parse fail)"
