for i in $(seq 1 24); do curl -s --max-time 8 http://127.0.0.1:4300/status | grep -q '"loggato":true' && break; sleep 5; done
curl -s --max-time 150 'http://127.0.0.1:4300/hubpremio?targa=GY263BY&situazione=Rinnovo&next=4' > /tmp/hp.json
echo "=== dimensione risposta ==="; wc -c /tmp/hp.json
python3 -c "import json; d=json.load(open('/tmp/hp.json')); dr=d.get('drive') or {}; print('drive keys:', list(dr.keys())); print('error:', dr.get('error')); print('step_finale:', dr.get('step_finale')); print('LOG:'); [print('  ',x) for x in (dr.get('log') or [])]; print('scontoEls:', dr.get('scontoEls')); print('fnSconto:', dr.get('fnSconto')); print('scontoPanelHtml:', (dr.get('scontoPanelHtml') or '')[:1500])" 2>&1 | head -45
