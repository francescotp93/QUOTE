set -u
echo "=== scraper: parte da /uefa/ e segue il redirect OIDC (browser vero, esegue JS) ==="
curl -s --max-time 90 "http://127.0.0.1:4400/explore?goto=https%3A%2F%2Faccess.hdia.it%2Fuefa%2F&sniff=1" -o /tmp/uf.json
node -e '
let d; try{ d=require("/tmp/uf.json"); }catch(e){ console.log("PARSE ERR"); process.exit(0);} 
console.log("url finale:", d.url||(d.dump&&d.dump.url)||"");
console.log("title:", (d.dump&&d.dump.title)||d.title||"");
const f=d.fields||(d.dump&&d.dump.ctrls)||[];
console.log("campi login presenti:", JSON.stringify(f).slice(0,500));
const calls=d.captured||d.sniff||[];
console.log("chiamate catturate:", Array.isArray(calls)?calls.length:0);
if(Array.isArray(calls)) calls.slice(0,12).forEach(c=>console.log("  ",JSON.stringify(c).slice(0,160)));
'
