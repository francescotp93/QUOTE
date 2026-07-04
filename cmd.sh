set +e
echo "== stato italiana 4300 =="; timeout 6 curl -s --max-time 5 "http://127.0.0.1:4300/status" 2>/dev/null | head -c 160; echo ""
echo "== 1) BASE senza garanzie GY263BY =="; T0=$(date +%s)
timeout 150 curl -s --max-time 145 "http://127.0.0.1:4300/premio?targa=GY263BY&situazione=Rinnovo" 2>&1 > /tmp/i1.json
python3 -c "import json; d=json.load(open('/tmp/i1.json')); print('ok',d.get('ok'),'premio',(d.get('premio') or {}).get('premio_annuale') or d.get('premio_annuale'),'gar',d.get('garanzie_incluse'))" 2>&1 | head -c 300
echo "  ($(($(date +%s)-T0))s)"
echo "== 2) CON infortuni_conducente GY263BY =="; T0=$(date +%s)
timeout 150 curl -s --max-time 145 "http://127.0.0.1:4300/premio?targa=GY263BY&situazione=Rinnovo&garanzie=infortuni_conducente" 2>&1 > /tmp/i2.json
python3 -c "import json; d=json.load(open('/tmp/i2.json')); print('ok',d.get('ok'),'premio',(d.get('premio') or {}).get('premio_annuale') or d.get('premio_annuale'),'gar',d.get('garanzie_incluse'))" 2>&1 | head -c 300
echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
