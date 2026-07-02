set +e
BE=/opt/withus-backend
echo "== attendo autopull (40s) =="; sleep 40
echo "== 135s su disco? =="; grep -c 'LOCK_MAX_MS = 135000' $BE/scraper/hdi/quote-service.mjs 2>&1
echo "== restart hdi-scraper (sessione FREDDA) =="; sudo systemctl restart hdi-scraper.service 2>&1; echo "  rc=$?"
sleep 20
echo "== TCM a freddo (come l'utente: 100000/30/No/annuale) =="
T0=$(date +%s); curl -s --max-time 140 "http://127.0.0.1:4400/premio-tcm?capitale=100000&durata=30&nascita=17/07/1993&eta=33&fumatore=0&frazcode=1&prodotto=TCM07H.7" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  ok',d.get('ok'),'premio',d.get('premio_lordo'),'err',d.get('error'))" 2>&1; echo "  ($(($(date +%s)-T0))s)"
echo "== TCM subito dopo (caldo) =="
T0=$(date +%s); curl -s --max-time 140 "http://127.0.0.1:4400/premio-tcm?capitale=100000&durata=30&nascita=17/07/1993&eta=33&fumatore=0&frazcode=1&prodotto=TCM07H.7" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  ok',d.get('ok'),'premio',d.get('premio_lordo'))" 2>&1; echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
