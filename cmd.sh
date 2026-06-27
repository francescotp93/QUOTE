set -u
echo "=== esploro l'app Giada autenticata: menu, link, e API catturate ==="
curl -s --max-time 90 "http://127.0.0.1:4400/explore?goto=https%3A%2F%2Faccess.hdia.it%2Fuefa%2F&sniff=1" -o /tmp/g.json
node -e '
let d; try{ d=require("/tmp/g.json"); }catch(e){ console.log("PARSE ERR"); process.exit(0);} 
const dump=d.dump||d;
console.log("url:", d.url||dump.url||"");
console.log("title:", dump.title||"");
console.log("text(400):", String(dump.text||"").slice(0,400).replace(/\s+/g," "));
const links=dump.links||dump.menu||d.menu||[];
console.log("LINK/MENU ("+(links.length||0)+"):", JSON.stringify(links).slice(0,900));
const calls=d.captured||d.sniff||[];
console.log("=== API CATTURATE ("+(Array.isArray(calls)?calls.length:0)+") ===");
if(Array.isArray(calls)) calls.forEach(c=>{const u=c.url||""; if(/\.(png|jpg|svg|css|woff|js|ico)(\?|$)/i.test(u))return; console.log((c.method||c.kind||"")+" ["+(c.status||"")+"] "+u.slice(0,160));});
'
