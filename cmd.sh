set -u
echo "=== attendo deploy ensurePage robusto ==="
for i in $(seq 1 16); do
  if grep -q "pagina non risponde" /opt/withus-backend/scraper/groupama/quote-service.mjs 2>/dev/null; then echo "deployato ($i)"; break; fi
  echo "  ...($i)"; sleep 12
done
sleep 6
node -e 'const fs=require("fs");const P="/opt/withus-backend/server/fonti.store.json";try{const s=JSON.parse(fs.readFileSync(P,"utf8"));if(s.__custom&&s.__custom["c-groupama"]){delete s.__custom["c-groupama"].codice;delete s.__custom["c-groupama"].codice_ts;}fs.writeFileSync(P,JSON.stringify(s,null,2));}catch(e){}'
echo "=== avvio login Groupama ==="
curl -s --max-time 12 "http://127.0.0.1:4500/login" >/dev/null 2>&1
sleep 30
echo "=== stato + log ==="
curl -s --max-time 8 "http://127.0.0.1:4500/status"; echo
journalctl -u groupama-scraper --no-pager -n 12 2>/dev/null | sed 's/.*\[groupama\]/[groupama]/' | grep -iE "fill|OTP|pagina|credenziali|recovery|loggato|step|PRONTO" | tail -8
