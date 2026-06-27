set -u
echo "=== attendo che lo scraper HDI sia ripartito (autopull) ==="
for i in $(seq 1 12); do
  ST=$(curl -s --max-time 10 "http://127.0.0.1:4400/status" 2>/dev/null)
  if [ -n "$ST" ]; then echo "status: $ST"; break; fi
  echo "  non ancora su... ($i)"; sleep 10
done
echo "=== lancio /login (autoLogin: /uefa/ → Keycloak → credenziali) ==="
curl -s --max-time 120 "http://127.0.0.1:4400/login" | head -c 600
echo
echo "=== /status dopo login ==="
curl -s --max-time 20 "http://127.0.0.1:4400/status"
echo
echo "=== dove si trova ora (logindump) ==="
curl -s --max-time 40 "http://127.0.0.1:4400/logindump" -o /tmp/ld.json
node -e 'try{const d=require("/tmp/ld.json");console.log("url:",d.url||"");console.log("title:",d.title||"");console.log("campi:",JSON.stringify(d.ctrls||d.fields||[]).slice(0,400));}catch(e){console.log("dump vuoto");}'
