set -u
curl -s --max-time 12 "http://127.0.0.1:4500/login" >/dev/null 2>&1
sleep 32
echo "=== GROUPAMA log completo (ultimi 16, no filtro) ==="
journalctl -u groupama-scraper --no-pager -n 16 2>/dev/null | sed 's/.*start-service.sh\[[0-9]*\]: //'
echo "=== GROUPAMA pagina ora ==="
curl -s --max-time 25 "http://127.0.0.1:4500/logindump" -o /tmp/g.json
node -e 'try{const d=require("/tmp/g.json");console.log("url:",d.url,"| title:",d.title);console.log("text:",String(d.text||"").slice(0,160).replace(/\s+/g," "));console.log("CAMPI:",JSON.stringify(d.ctrls||[]).slice(0,500));}catch(e){console.log("dump err")}'
