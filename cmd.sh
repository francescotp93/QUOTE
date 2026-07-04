set +e
echo "== autopull(40s)+restart hdi =="; sleep 40
sudo systemctl restart hdi-scraper.service 2>&1 | head -1
for i in $(seq 1 30); do echo "$(timeout 5 curl -s --max-time 4 http://127.0.0.1:4400/status 2>/dev/null)" | grep -q '"loggato":true' && { echo "pronto ${i}"; break; }; sleep 3; done
echo "== HDI card HTML + dialog sconto GY263BY =="; T0=$(date +%s)
timeout 160 curl -s --max-time 155 "http://127.0.0.1:4400/premio?targa=GY263BY&nascita=17/07/1993&pacchetto=0&debug=1" 2>&1 > /tmp/hs.json
python3 -c "
import json
d=json.load(open('/tmp/hs.json'))
gd=d.get('garanzie_dom') or {}
print('=== CARD HTML (Incendio) ===')
print((gd.get('cardHtml') or '')[:1600])
print('=== SCONTO DIALOG ===')
print(json.dumps(gd.get('scontoDialog'),ensure_ascii=False,indent=1)[:1200])
" 2>&1
echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
