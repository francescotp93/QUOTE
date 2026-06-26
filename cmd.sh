for i in $(seq 1 36); do git -C /opt/withus-backend merge-base --is-ancestor b5dfeb0 HEAD 2>/dev/null && break; sleep 5; done
for i in $(seq 1 24); do curl -s --max-time 8 http://127.0.0.1:4300/status | grep -q '"loggato":true' && break; sleep 5; done
echo "=== /hubpremio: pannello sconto ==="
curl -s --max-time 150 'http://127.0.0.1:4300/hubpremio?targa=GY263BY&situazione=Rinnovo&next=4' > /tmp/hp.json
python3 -c "import json; d=json.load(open('/tmp/hp.json')); dr=d.get('drive') or {}; print('fnSconto:', dr.get('fnSconto')); print('scontoEls:'); [print('  ',e) for e in (dr.get('scontoEls') or [])]; print('bottoni:', dr.get('bottoni')); print('--- scontoPanelHtml ---'); print((dr.get('scontoPanelHtml') or '')[:2200])" 2>&1 | head -50
