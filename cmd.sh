set -u
echo "=== pulisco codice vecchio (scaduto) ==="
node -e 'const fs=require("fs");const P="/opt/withus-backend/server/fonti.store.json";try{const s=JSON.parse(fs.readFileSync(P,"utf8"));if(s.__custom&&s.__custom["c-groupama"]){delete s.__custom["c-groupama"].codice;delete s.__custom["c-groupama"].codice_ts;fs.writeFileSync(P,JSON.stringify(s,null,2));console.log("ok");}}catch(e){console.log(e.message)}'
echo "=== attendo redeploy (boot 'pronto', NON invia OTP) ==="
for i in $(seq 1 14); do
  if grep -q "PRONTO al login" /opt/withus-backend/scraper/groupama/quote-service.mjs 2>/dev/null; then echo "deployato ($i)"; break; fi
  echo "  ...($i)"; sleep 12
done
sleep 6
echo "=== stato (atteso: pronto, login_running false, nessun OTP) ==="
curl -s --max-time 10 "http://127.0.0.1:4500/status"; echo
