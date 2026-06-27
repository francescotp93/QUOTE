set -u
echo "=== HDI /status ==="
curl -s --max-time 20 "http://127.0.0.1:4400/status" || echo "(non raggiungibile)"
echo; echo "=== HDI /logindump (dove si trova, che campi/login mostra) ==="
curl -s --max-time 40 "http://127.0.0.1:4400/logindump" -o /tmp/hdi.json
node -e '
let d; try{ d=require("/tmp/hdi.json"); }catch(e){ console.log("PARSE ERR / vuoto"); process.exit(0);} 
const s=JSON.stringify(d);
console.log("url:", d.url||d.URL||"");
console.log("title:", d.title||"");
console.log("text(primi 300):", String(d.text||d.bodyText||"").slice(0,300).replace(/\s+/g," "));
console.log("campi/ctrls:", JSON.stringify(d.ctrls||d.fields||d.campi||d.inputs||[]).slice(0,600));
console.log("chiavi disponibili:", Object.keys(d));
'
