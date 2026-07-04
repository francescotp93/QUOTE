set +e
echo "== autopull(40s)+restart hdi =="; sleep 40
sudo systemctl restart hdi-scraper.service 2>&1 | head -1
for i in $(seq 1 30); do echo "$(timeout 5 curl -s --max-time 4 http://127.0.0.1:4400/status 2>/dev/null)" | grep -q '"loggato":true' && { echo "pronto ${i}"; break; }; sleep 3; done
echo "== HDI /premio?debug=1 GY263BY (dump DOM garanzie) =="; T0=$(date +%s)
timeout 160 curl -s --max-time 155 "http://127.0.0.1:4400/premio?targa=GY263BY&nascita=17/07/1993&debug=1" 2>&1 > /tmp/hdiout.json
python3 -c "
import json
d=json.load(open('/tmp/hdiout.json'))
print('ok',d.get('ok'),'premio',d.get('premio_annuale'),'src',d.get('premio_src'))
print('garanzie lette:',[g.get('nome') for g in (d.get('garanzie') or [])][:12])
gd=d.get('garanzie_dom') or {}
print('--- CARDS ---')
for c in (gd.get('cards') or [])[:12]:
    print(' TXT:',c.get('text'))
    for b in c.get('btns',[])[:5]: print('    btn',b)
print('--- SCONTO ---',gd.get('sconto'))
print('--- SLIDERS ---',gd.get('sliders'))
" 2>&1 | head -70
echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
