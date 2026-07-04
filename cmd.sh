set +e
echo "== autopull(40s)+restart hdi =="; sleep 40
sudo systemctl restart hdi-scraper.service 2>&1 | head -1
for i in $(seq 1 30); do echo "$(timeout 5 curl -s --max-time 4 http://127.0.0.1:4400/status 2>/dev/null)" | grep -q '"loggato":true' && { echo "pronto ${i}"; break; }; sleep 3; done
echo "== HDI dump bottoni garanzie GY263BY =="; T0=$(date +%s)
timeout 160 curl -s --max-time 155 "http://127.0.0.1:4400/premio?targa=GY263BY&nascita=17/07/1993&pacchetto=0&debug=1" 2>&1 > /tmp/hb.json
python3 -c "
import json
d=json.load(open('/tmp/hb.json'))
gd=d.get('garanzie_dom') or {}
for c in (gd.get('cards') or []):
    if any(k in c.get('text','') for k in ['Infortuni','Tutela','Incendio']):
        print('CARD:',c.get('text'))
        for b in c.get('btns',[]): print('   ',{'testid':b.get('testid'),'aria':b.get('aria'),'t':b.get('t'),'disabled':b.get('disabled'),'cls':b.get('cls','')[:35]})
" 2>&1 | head -40
echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
