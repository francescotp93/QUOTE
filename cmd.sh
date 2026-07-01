cd /opt/withus-backend
echo "=== moto.js aggiornato in produzione? ==="
grep -c "premio-casa" server/moto.js 2>/dev/null
echo "=== withus-backend attivo ==="
systemctl is-active withus-backend 2>/dev/null
echo "=== rotta viva? (senza token → deve dare 401/errore auth, NON 404) ==="
curl -s -m 20 -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:3000/moto/premio-casa?provincia=TP&tipo=1&mq=1" 2>/dev/null
echo "=== HDI scraper /premio-casa diretto (prova reale) ==="
curl -s -m 90 "http://127.0.0.1:4400/premio-casa?provincia=TP&tipo=1&mq=1&dimora=1&piano=2&cc=2&eta=6" 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);print('ok:',d.get('ok'),'premio:',d.get('premio_totale'))" 2>/dev/null || echo "(hdi err)"
echo "---fine---"
