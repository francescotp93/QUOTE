set +e
BE=/opt/withus-backend
echo "== autopull (40s) =="; sleep 40
echo "== fattori su disco? scraper:$(grep -c "fattoriP" $BE/scraper/hdi/quote-service.mjs) moto:$(grep -c "'fattori'" $BE/server/moto.js) =="
echo "== restart scraper+backend =="; sudo systemctl restart hdi-scraper.service 2>&1; sudo systemctl restart withus-backend.service 2>&1; sleep 40
GAR="081035,081036,081278,081279,081280,081281,081282,081283,081284,091202,131065,135032,131067,131068,181009"
echo "== A) base (no tutela) =="; curl -s --max-time 130 "http://127.0.0.1:4400/premio-casa?provincia=TP&tipo=1&mq=2&dimora=1&piano=2&cc=2&eta=5&garanzie=$GAR" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  via',d.get('via'),'lordo',d.get('premio_totale'))" 2>&1
echo "== B) + Tutela Legale 170218 massimale 15000 =="; curl -s --max-time 130 "http://127.0.0.1:4400/premio-casa?provincia=TP&tipo=1&mq=2&dimora=1&piano=2&cc=2&eta=5&garanzie=$GAR,170218&fattori=170218~3MAXTU~15000" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  via',d.get('via'),'lordo',d.get('premio_totale'))" 2>&1
echo "== C) + Tutela 20000 (deve cambiare) =="; curl -s --max-time 130 "http://127.0.0.1:4400/premio-casa?provincia=TP&tipo=1&mq=2&dimora=1&piano=2&cc=2&eta=5&garanzie=$GAR,170218&fattori=170218~3MAXTU~20000" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  via',d.get('via'),'lordo',d.get('premio_totale'))" 2>&1
echo "== D) + Pet Assistance 181009~3APET~1 (deve aumentare) =="; curl -s --max-time 130 "http://127.0.0.1:4400/premio-casa?provincia=TP&tipo=1&mq=2&dimora=1&piano=2&cc=2&eta=5&garanzie=$GAR&fattori=181009~3APET~1" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  via',d.get('via'),'lordo',d.get('premio_totale'))" 2>&1
echo "---fine---"
