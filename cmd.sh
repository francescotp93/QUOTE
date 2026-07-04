set +e
echo "== autopull(40s)+restart hdi =="; sleep 40
sudo systemctl restart hdi-scraper.service 2>&1 | head -1
for i in $(seq 1 30); do echo "$(timeout 5 curl -s --max-time 4 http://127.0.0.1:4400/status 2>/dev/null)" | grep -q '"loggato":true' && { echo "pronto ${i}"; break; }; sleep 3; done
echo "== HDI riga garanzia estesa GY263BY =="; T0=$(date +%s)
timeout 170 curl -s --max-time 165 "http://127.0.0.1:4400/premio?targa=GY263BY&nascita=17/07/1993&debug=1" 2>&1 > /tmp/hr.json
python3 -c "
import json
d=json.load(open('/tmp/hr.json'))
gd=d.get('garanzie_dom') or {}
print('=== INTERACTIVE nella riga Incendio ===')
for e in (gd.get('incendioRowInteractive') or []): print('  ',e)
print('=== ROW HTML ===')
print((gd.get('incendioRowHtml') or '')[:2200])
" 2>&1
echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
