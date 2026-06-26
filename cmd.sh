for i in $(seq 1 30); do git -C /opt/withus-backend merge-base --is-ancestor 9349eb5 HEAD 2>/dev/null && { echo "deploy 9349eb5 OK"; break; }; sleep 5; done
sleep 10
echo "=== deploy HEAD ==="; git -C /opt/withus-backend log --oneline -1
echo "=== /premio (con guida esperta + sconto massimo) ==="
curl -s --max-time 160 'http://127.0.0.1:4300/premio?targa=GY263BY&situazione=Rinnovo' | python3 -c "import sys,json; d=json.load(sys.stdin); p=d.get('premio') or {}; print('annuale:',p.get('premio_annuale'),'imponibile:',p.get('premio_imponibile')); print('garanzie:', [(g.get('nome'),g.get('premio')) for g in (p.get('garanzie') or [])]); print('LOG drive:'); [print('  ',x) for x in (d.get('log') or [])]"
