set -u
echo "=== clic CONFERMA → dashboard Giada (menu + API) ==="
curl -s --max-time 90 "http://127.0.0.1:4400/explore?goto=https%3A%2F%2Faccess.hdia.it%2Fuefa%2F&click=CONFERMA&sniff=1" -o /tmp/c.json
node -e '
let d; try{ d=require("/tmp/c.json"); }catch(e){ console.log("PARSE ERR"); process.exit(0);} 
const dump=d.dump||d;
console.log("url:", d.url||dump.url||"");
console.log("title:", dump.title||"");
console.log("text(500):", String(dump.text||"").slice(0,500).replace(/\s+/g," "));
const links=dump.links||dump.menu||[];
console.log("LINK/MENU:", JSON.stringify(links).slice(0,1000));
const calls=(d.captured||d.sniff||[]).map(c=>c.url||"").filter(u=>/gwm\.hdia|\/api|preventiv|quotaz|veicol|targa|auto/i.test(u)&&!/\.(png|js|css|svg|woff)/i.test(u));
console.log("=== API rilevanti (gwm/preventivo/veicolo) ===");
[...new Set(calls)].forEach(u=>console.log("  ",u.slice(0,170)));
'
