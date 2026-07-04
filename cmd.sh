set +e
echo "== autopull(40s)+restart hdi =="; sleep 40
sudo systemctl restart hdi-scraper.service 2>&1 | head -1
for i in $(seq 1 30); do echo "$(timeout 5 curl -s --max-time 4 http://127.0.0.1:4400/status 2>/dev/null)" | grep -q '"loggato":true' && { echo "pronto ${i}"; break; }; sleep 3; done
echo "== 1) BASE (pacchetto=0) GY263BY =="; T0=$(date +%s)
timeout 150 curl -s --max-time 145 "http://127.0.0.1:4400/premio?targa=GY263BY&nascita=17/07/1993&pacchetto=0" 2>&1 | python3 -c "import json,sys; d=json.load(sys.stdin); print('premio',d.get('premio_annuale'),'ok',d.get('ok'))" 2>&1
echo "  ($(($(date +%s)-T0))s)"
echo "== 2) PACCHETTO GY263BY (debug) =="; T0=$(date +%s)
timeout 170 curl -s --max-time 165 "http://127.0.0.1:4400/premio?targa=GY263BY&nascita=17/07/1993&debug=1" 2>&1 > /tmp/hp.json
python3 -c "
import json
d=json.load(open('/tmp/hp.json'))
print('premio finale:',d.get('premio_annuale'),'src',d.get('premio_src'))
p=d.get('pacchetto') or {}
print('infortuni add:',p.get('infortuni'))
print('tutela add:',p.get('tutela'))
print('base→pacchetto:',p.get('premio_base'),'→',p.get('premio_con_pacchetto'))
" 2>&1
echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
