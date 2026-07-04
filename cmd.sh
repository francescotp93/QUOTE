set +e
echo "== autopull(40s)+restart hdi =="; sleep 40
sudo systemctl restart hdi-scraper.service 2>&1 | head -1
for i in $(seq 1 30); do echo "$(timeout 5 curl -s --max-time 4 http://127.0.0.1:4400/status 2>/dev/null)" | grep -q '"loggato":true' && { echo "pronto ${i}"; break; }; sleep 3; done
echo "== HDI inventario icone/toggle/% GY263BY =="; T0=$(date +%s)
timeout 160 curl -s --max-time 155 "http://127.0.0.1:4400/premio?targa=GY263BY&nascita=17/07/1993&pacchetto=0&debug=1" 2>&1 > /tmp/hi.json
python3 -c "
import json
d=json.load(open('/tmp/hi.json'))
gd=d.get('garanzie_dom') or {}
print('--- ICONS (testid | t | near) ---')
for ic in (gd.get('icons') or []): print(' ',ic.get('testid',''),'|',ic.get('t',''),'|',ic.get('near','')[:45])
print('--- TOGGLES ---')
for t in (gd.get('toggles') or []): print(' ',t.get('tag'),t.get('cls'),'checked=',t.get('checked'),'|',t.get('near','')[:45])
print('--- PERC/% ---')
for p in (gd.get('perc') or []): print(' ',p)
" 2>&1 | head -90
echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
