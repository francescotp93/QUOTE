set -u
echo "=== pulisco il codice vecchio dal store (così non riusa quello scaduto) ==="
node -e '
const fs=require("fs"); const P="/opt/withus-backend/server/fonti.store.json";
try{const s=JSON.parse(fs.readFileSync(P,"utf8")); if(s.__custom&&s.__custom["c-groupama"]){delete s.__custom["c-groupama"].codice; delete s.__custom["c-groupama"].codice_ts; fs.writeFileSync(P,JSON.stringify(s,null,2)); console.log("codice vecchio rimosso");}}catch(e){console.log("err",e.message)}
'
echo "=== riavvio scraper Groupama (login fresco) ==="
systemctl restart groupama-scraper 2>/dev/null && echo "riavviato" || echo "restart fallito"
echo "=== attendo lo step OTP fresco ==="
for i in $(seq 1 16); do
  S=$(curl -s --max-time 8 "http://127.0.0.1:4500/status" 2>/dev/null)
  [ -n "$S" ] && echo "[$i] $S" || echo "[$i] non ancora su"
  echo "$S" | grep -q "attesa_otp\|loggato" && break
  sleep 8
done
