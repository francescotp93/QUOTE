#!/usr/bin/env bash
# La rotta risponde 200 con un token valido? E l'allarme funziona?
set -u
cd /opt/withus-backend || exit 1
echo "=== commit sulla macchina ==="; git log --oneline -1
echo "=== l'allarme e' nel codice in esecuzione ==="; grep -c "ALLARME" server/registro.js || true
cd server; set -a; . ./.env; set +a
echo
echo "=== chiamata alla rotta CON un token valido (chiave di servizio) ==="
code=$(curl -s -o /tmp/r.json -w "%{http_code}" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" http://127.0.0.1:3000/parametri-previdenziali/numeri)
echo "HTTP $code"
node -e '
const d=JSON.parse(require("fs").readFileSync("/tmp/r.json","utf8"));
console.log("coefficienti a 67 anni:", d.coefficienti && d.coefficienti.perEta && d.coefficienti.perEta["67"]);
console.log("coefficiente rendita fondo:", d.numeri && d.numeri.coefficiente_rendita_fondo);
console.log("costi per tipo prodotto:", JSON.stringify(d.numeri && d.numeri.tipo_prodotto));
console.log("avvisi:", (d.avvisi||[]).length);
' 2>/dev/null || head -c 300 /tmp/r.json
echo
echo "=== chiamata SENZA token: deve comparire l'ALLARME nel giornale ==="
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:3000/parametri-previdenziali/numeri
sleep 1
journalctl -u withus-backend --since "1 min ago" --no-pager | grep -E "ALLARME|parametri-previdenziali" | tail -5
rm -f /tmp/r.json
