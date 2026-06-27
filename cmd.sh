set -u
echo "=== stato Groupama adesso ==="
curl -s --max-time 10 "http://127.0.0.1:4500/status"; echo
curl -s --max-time 10 "http://127.0.0.1:4500/loginstate"; echo
echo "=== dump pagina (dove siamo) ==="
curl -s --max-time 30 "http://127.0.0.1:4500/logindump" -o /tmp/g.json
node -e 'try{const d=require("/tmp/g.json");console.log("url:",d.url,"| title:",d.title);console.log("text:",String(d.text||"").slice(0,200).replace(/\s+/g," "));}catch(e){console.log("dump vuoto")}'
