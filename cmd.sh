set -u
echo "=== attendo redeploy (routing fix) ==="
for i in $(seq 1 14); do
  if grep -q "loginstate va controllato PRIMA" /opt/withus-backend/scraper/groupama/quote-service.mjs 2>/dev/null; then echo "deployato ($i)"; break; fi
  echo "  ...($i)"; sleep 12
done
sleep 6
node -e 'const fs=require("fs");const P="/opt/withus-backend/server/fonti.store.json";try{const s=JSON.parse(fs.readFileSync(P,"utf8"));for(const k of ["c-groupama","c-prima"]){if(s.__custom&&s.__custom[k]){delete s.__custom[k].codice;delete s.__custom[k].codice_ts;}}fs.writeFileSync(P,JSON.stringify(s,null,2));}catch(e){}'
echo "=== avvio login (una volta) ==="
curl -s --max-time 12 "http://127.0.0.1:4500/login" >/dev/null 2>&1
curl -s --max-time 12 "http://127.0.0.1:4600/login" >/dev/null 2>&1
echo "=== osservo via /status (deve progredire start→credenziali→attesa_otp e RESTARE) ==="
for i in $(seq 1 14); do
  G=$(curl -s --max-time 6 "http://127.0.0.1:4500/status" 2>/dev/null | sed 's/.*login_step":"\([^"]*\)".*/\1/')
  P=$(curl -s --max-time 6 "http://127.0.0.1:4600/status" 2>/dev/null | sed 's/.*login_step":"\([^"]*\)".*/\1/')
  echo "[$i] GROUPAMA step=$G | PRIMA step=$P"
  sleep 9
done
echo "=== stato finale completo ==="
curl -s --max-time 8 "http://127.0.0.1:4500/status"; echo
curl -s --max-time 8 "http://127.0.0.1:4600/status"; echo
