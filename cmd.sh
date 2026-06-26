for i in $(seq 1 30); do git -C /opt/withus-backend merge-base --is-ancestor 9349eb5 HEAD 2>/dev/null && break; sleep 5; done
echo "=== attendo scraper loggato ==="
for i in $(seq 1 24); do curl -s --max-time 8 http://127.0.0.1:4300/status | grep -q '"loggato":true' && { echo "scraper pronto (giro $i)"; break; }; sleep 5; done
echo "=== /premio (guida esperta + sconto massimo) ==="
curl -s --max-time 180 'http://127.0.0.1:4300/premio?targa=GY263BY&situazione=Rinnovo' > /tmp/pm2.json
python3 -c "import json; d=json.load(open('/tmp/pm2.json')); p=d.get('premio') or {}; print('annuale:',p.get('premio_annuale'),'imponibile:',p.get('premio_imponibile')); print('garanzie:', [(g.get('nome'),g.get('premio')) for g in (p.get('garanzie') or [])]); print('LOG:'); [print('  ',x) for x in (d.get('log') or [])]" 2>&1 | head -40
