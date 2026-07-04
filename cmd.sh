set +e
echo "== autopull(40s)+restart axa =="; sleep 40
sudo systemctl restart axa-scraper.service 2>&1 | head -1
for i in $(seq 1 30); do echo "$(timeout 5 curl -s --max-time 4 http://127.0.0.1:4700/status 2>/dev/null)" | grep -q '"loggato":true' && { echo "pronto ${i}"; break; }; sleep 3; done
echo "== AXA /premiodiretto GY263BY (pacchetto RCAP+INF) =="; T0=$(date +%s)
timeout 120 curl -s --max-time 115 "http://127.0.0.1:4700/premiodiretto?targa=GY263BY&nascita=17/07/1993" 2>&1 > /tmp/ax.json
python3 -c "
import json
d=json.load(open('/tmp/ax.json'))
print('ok',d.get('ok'),'premio',d.get('premio_annuale') or d.get('gross'),'via',d.get('via'))
print('unitOn:',d.get('unitOn') or d.get('garanzie_incluse'))
print('dbg:',json.dumps(d.get('dbg'),ensure_ascii=False)[:400])
print('err:',d.get('error'))
" 2>&1
echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
