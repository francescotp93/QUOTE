set -u
echo "=== HDI: esploro access.hdia.it (app reale post-SSO) ==="
curl -s --max-time 80 "http://127.0.0.1:4400/explore?goto=https://access.hdia.it/&sniff=1" -o /tmp/hx.json
node -e '
let d; try{ d=require("/tmp/hx.json"); }catch(e){ console.log("PARSE ERR / vuoto:",e.message); process.exit(0);} 
console.log("chiavi:", Object.keys(d));
console.log("url finale:", d.url||(d.dump&&d.dump.url)||"");
console.log("title:", (d.dump&&d.dump.title)||d.title||"");
console.log("text(300):", String((d.dump&&d.dump.text)||d.text||"").slice(0,300).replace(/\s+/g," "));
const links=(d.dump&&(d.dump.links||d.dump.menu))||d.links||d.menu||[];
console.log("link/menu:", JSON.stringify(links).slice(0,800));
const calls=d.sniff||d.calls||[];
console.log("chiamate API catturate:", Array.isArray(calls)?calls.length:0);
if(Array.isArray(calls)) calls.slice(0,15).forEach(c=>console.log("  ", JSON.stringify(c).slice(0,200)));
'
