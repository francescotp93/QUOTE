set -u
echo "=== attendo che il NUOVO codice (APP_HOME) sia deployato ==="
for i in $(seq 1 15); do
  if grep -q "APP_HOME = 'https://access.hdia.it/uefa/'" /opt/withus-backend/scraper/hdi/quote-service.mjs 2>/dev/null; then echo "nuovo codice deployato (tentativo $i)"; break; fi
  echo "  non ancora... ($i)"; sleep 12
done
# do' un attimo allo scraper per riavviarsi col nuovo codice
sleep 8
echo "=== lancio login ==="
curl -s --max-time 130 "http://127.0.0.1:4400/login" | head -c 400; echo
echo "=== /status ==="
curl -s --max-time 20 "http://127.0.0.1:4400/status"; echo
echo "=== dove sono ora (logindump) ==="
curl -s --max-time 40 "http://127.0.0.1:4400/logindump" -o /tmp/ld.json
node -e 'try{const d=require("/tmp/ld.json");console.log("url:",d.url||"");console.log("title:",d.title||"");console.log("text(200):",String(d.text||"").slice(0,200).replace(/\s+/g," "));console.log("campi:",JSON.stringify(d.ctrls||d.fields||[]).slice(0,300));}catch(e){console.log("dump vuoto")}'
