for i in $(seq 1 10); do H=$(git -C /opt/withus-backend rev-parse --short HEAD 2>/dev/null); [ "$H" = "ca6c7dd" ] && break; sleep 8; done
echo "HEAD=$(git -C /opt/withus-backend rev-parse --short HEAD 2>/dev/null)"
sudo systemctl restart allianz-scraper.service 2>&1 || systemctl restart allianz-scraper.service 2>&1
for i in $(seq 1 13); do S=$(curl -s -m 8 "http://127.0.0.1:4200/status" 2>/dev/null); echo "$S" | grep -q '"loggato":true' && { echo PRONTO; break; }; sleep 8; done
curl -s -m 15 "http://127.0.0.1:4200/pausakeepalive?min=25" >/dev/null 2>&1
echo "=== /premio (garanzie disponibili) ==="
curl -s -m 120 "http://127.0.0.1:4200/premio?targa=GY263BY&nascita=17/07/1993&tipo=auto" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('premio',d.get('premio_annuale'),'| incluse:',d.get('garanzie_incluse'))
print('sconti:',d.get('sconti'))
for sz in d.get('sezioni',[]):
  print('SEZ',sz['nome'],'premio',sz['premio'])
  for g in sz['garanzie']:
    print('   ',('[x]' if g['inclusa'] else '[ ]'),g['nome'],'| premio',g['premio'],'| sconto_max%',g['sconto_max_pct'])
" 2>/dev/null || echo fail
