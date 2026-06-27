set -u
echo "=== attendo redeploy fix (clickConfirm) ==="
for i in $(seq 1 16); do
  if grep -q "clickConfirm" /opt/withus-backend/scraper/groupama/quote-service.mjs 2>/dev/null; then echo "deployato ($i)"; break; fi
  echo "  ...($i)"; sleep 12
done
# assicuro che il service sia attivo (era stato stoppato a mano)
systemctl start groupama-scraper 2>/dev/null || true
sleep 8
echo "=== pulisco codici vecchi ==="
node -e 'const fs=require("fs");const P="/opt/withus-backend/server/fonti.store.json";try{const s=JSON.parse(fs.readFileSync(P,"utf8"));for(const k of ["c-groupama","c-prima","c-axa"]){if(s.__custom&&s.__custom[k]){delete s.__custom[k].codice;delete s.__custom[k].codice_ts;}}fs.writeFileSync(P,JSON.stringify(s,null,2));console.log("ok");}catch(e){console.log(e.message)}'
echo "=== stato Groupama (atteso pronto, no OTP auto) ==="
curl -s --max-time 8 "http://127.0.0.1:4500/status"; echo
