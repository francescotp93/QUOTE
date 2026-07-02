set +e
echo "== backend attivo? =="
systemctl is-active withus-backend 2>&1
echo "== la route /moto/premio-tcm esiste nel file deployato? =="
grep -c "premio-tcm" /opt/withus-backend/server/moto.js 2>&1
echo "== chiamata backend diretta (senza token) =="
curl -s --max-time 120 "http://127.0.0.1:3000/moto/premio-tcm?capitale=150000&durata=30&nascita=17/07/1993&eta=33&fumatore=1&frazcode=8&prodotto=TCM07H.7" -w "\nHTTP:%{http_code}\n" 2>&1 | head -c 500
echo ""
echo "== confronto: /moto/premio-casa (senza token) =="
curl -s --max-time 90 "http://127.0.0.1:3000/moto/premio-casa?provincia=TP&tipo=1&mq=2&dimora=1&piano=2&cc=2&eta=5" -w "\nHTTP:%{http_code}\n" 2>&1 | head -c 300
echo ""
echo "---fine---"
