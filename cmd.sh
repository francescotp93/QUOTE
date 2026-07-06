set +e
for i in $(seq 1 20); do echo "$(timeout 5 curl -s --max-time 4 http://127.0.0.1:4200/status 2>/dev/null)" | grep -q '"loggato":true' && { echo "pronto ${i}"; break; }; sleep 3; done
echo "== ED648HK CON BERSANI GS455RH (output completo) =="; T0=$(date +%s)
timeout 190 curl -s --max-time 185 "http://127.0.0.1:4200/premio?targa=ED648HK&nascita=19/05/1995&tipo=auto&bersani=GS455RH" 2>&1 > /tmp/alb.json
python3 -c "
import json
d=json.load(open('/tmp/alb.json'))
print('ok',d.get('ok'),'| premio',d.get('premio_annuale'),'| cu',d.get('classe_cu'),'| err',d.get('error'))
print('pacchetto:',d.get('pacchetto'))
g=d.get('garanzie') or []
print('garanzie:',[ (x.get('nome'),x.get('premio')) for x in g if x.get('inclusa')][:8])
" 2>&1 | head -c 600
echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
