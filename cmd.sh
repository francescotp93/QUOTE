set -u
echo "=== reset pulito Groupama ==="
systemctl stop groupama-scraper 2>/dev/null; echo "stop"
sleep 2
pkill -9 -f "scraper/groupama/userdata" 2>/dev/null || true
rm -rf /opt/withus-backend/scraper/groupama/userdata /opt/withus-backend/scraper/groupama/auth.json 2>/dev/null && echo "profilo cancellato"
node -e 'const fs=require("fs");const P="/opt/withus-backend/server/fonti.store.json";try{const s=JSON.parse(fs.readFileSync(P,"utf8"));if(s.__custom&&s.__custom["c-groupama"]){delete s.__custom["c-groupama"].codice;delete s.__custom["c-groupama"].codice_ts;fs.writeFileSync(P,JSON.stringify(s,null,2));console.log("codice pulito");}}catch(e){console.log(e.message)}'
systemctl start groupama-scraper 2>/dev/null && echo "start"
echo "=== attendo login fresco fino allo step OTP ==="
for i in $(seq 1 22); do
  S=$(curl -s --max-time 8 "http://127.0.0.1:4500/status" 2>/dev/null)
  [ -n "$S" ] && echo "[$i] $S" || echo "[$i] non ancora su"
  echo "$S" | grep -q "attesa_otp\|loggato" && break
  sleep 8
done
