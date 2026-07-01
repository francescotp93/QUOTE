set +e
BASE="provincia=TP&tipo=1&mq=2&dimora=1&piano=2&cc=2&eta=5"
echo "== SOLO RC dell'abitazione (RC proprieta 131067,131068) =="
curl -s --max-time 90 "http://127.0.0.1:4400/premio-casa?$BASE&garanzie=131067,131068" | python3 -c "import sys,json;d=json.load(sys.stdin);print('ok',d.get('ok'),'tot',d.get('premio_totale'));[print('  -',g['nome'],g['lordo']) for g in d.get('garanzie',[])]" 2>&1
echo "== SOLO RC completa (vita+proprieta 131065,135032,131067,131068) =="
curl -s --max-time 90 "http://127.0.0.1:4400/premio-casa?$BASE&garanzie=131065,135032,131067,131068" | python3 -c "import sys,json;d=json.load(sys.stdin);print('ok',d.get('ok'),'tot',d.get('premio_totale'));[print('  -',g['nome'],g['lordo']) for g in d.get('garanzie',[])]" 2>&1
echo "---fine---"
