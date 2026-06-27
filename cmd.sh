set -u
echo "=== cosa c'è sulla pagina Groupama adesso ==="
curl -s --max-time 30 "http://127.0.0.1:4500/logindump" -o /tmp/g.json
node -e 'try{const d=require("/tmp/g.json");console.log("url:",d.url);console.log("title:",d.title);console.log("text(400):",String(d.text||"").slice(0,400).replace(/\s+/g," "));console.log("CAMPI:",JSON.stringify(d.ctrls||[]).slice(0,700));}catch(e){console.log("dump err",e.message)}'
