set -u
echo "=== test HDI /premio GY697XA + 10/09/1997 (Rinnovo, proprietario) ==="
curl -s --max-time 210 "http://127.0.0.1:4400/premio?targa=GY697XA&nascita=10%2F09%2F1997" -o /tmp/h.json
echo "bytes: $(wc -c </tmp/h.json)"
node -e '
let d; try{ d=require("/tmp/h.json"); }catch(e){ console.log("PARSE ERR:",e.message); process.exit(0);} 
console.log("ok:",d.ok,"| PREMIO ANNUALE:",d.premio_annuale,"| num:",d.premio_annuale_num);
console.log("url:",d.url);
console.log("garanzie:",JSON.stringify(d.garanzie||[]).slice(0,700));
console.log("--- LOG ---"); (d.log||[]).forEach(l=>console.log("  ",l));
console.log("--- API fastmotor rilevanti ---");
(d.api||[]).filter(a=>/fastmotor|premio|quotaz|calcola/i.test(a.url)).forEach(a=>console.log("  ",a.m,"["+a.s+"]",a.url.replace("https://gwm.hdia.it/uefa/",""),"\n     ",String(a.body||"").slice(0,400)));
'
