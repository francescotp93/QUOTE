set -u
echo "=== attendo redeploy (clickSubmit con Procedi) ==="
for i in $(seq 1 14); do
  if grep -q "POS_EXACT" /opt/withus-backend/scraper/prima/quote-service.mjs 2>/dev/null && grep -q "POS_EXACT" /opt/withus-backend/scraper/groupama/quote-service.mjs 2>/dev/null; then echo "deployato ($i)"; break; fi
  echo "  ...($i)"; sleep 12
done
sleep 5
# pulisco codici vecchi
node -e 'const fs=require("fs");const P="/opt/withus-backend/server/fonti.store.json";try{const s=JSON.parse(fs.readFileSync(P,"utf8"));for(const k of ["c-groupama","c-prima"]){if(s.__custom&&s.__custom[k]){delete s.__custom[k].codice;delete s.__custom[k].codice_ts;}}fs.writeFileSync(P,JSON.stringify(s,null,2));console.log("codici puliti");}catch(e){console.log(e.message)}'
echo "=== GROUPAMA: avvio login → atteso attesa_otp ==="
curl -s --max-time 12 "http://127.0.0.1:4500/login" >/dev/null 2>&1
echo "=== PRIMA: avvio login → atteso attesa_otp (Procedi → MFA) ==="
curl -s --max-time 12 "http://127.0.0.1:4600/login" >/dev/null 2>&1
echo "=== attendo che entrambi arrivino al codice ==="
for i in $(seq 1 16); do
  G=$(curl -s --max-time 6 "http://127.0.0.1:4500/loginstate" 2>/dev/null)
  P=$(curl -s --max-time 6 "http://127.0.0.1:4600/loginstate" 2>/dev/null)
  echo "[$i] GROUPAMA: $G | PRIMA: $P"
  echo "$G" | grep -q "attesa_otp\|loggato" && echo "$P" | grep -q "attesa_otp\|loggato\|totp_rifiutato\|error" && break
  sleep 8
done
