set -u
echo "=== MOTO DA23765 /hubveicolo debug=1 ==="
curl -s --max-time 90 "http://127.0.0.1:4300/hubveicolo?targa=DA23765&situazione=Rinnovo&debug=1" -o /tmp/moto.json
echo "bytes: $(wc -c </tmp/moto.json)"
node -e '
let d; try{ d=require("/tmp/moto.json"); }catch(e){ console.log("PARSE ERR", e.message); process.exit(0);} 
console.log("ok:",d.ok,"| error:",d.error||"");
console.log("prodotto:",JSON.stringify(d.prodotto));
console.log("dataKeys:",JSON.stringify(d.dataKeys));
console.log("veicolo(norm):",JSON.stringify(d.veicolo));
console.log("raw_veicolo keys:",d.raw_veicolo?Object.keys(d.raw_veicolo):null);
console.log("raw_veicolo:",JSON.stringify(d.raw_veicolo).slice(0,1500));
if(d.bersaniInfo)console.log("bersaniInfo:",JSON.stringify(d.bersaniInfo).slice(0,300));
if(Array.isArray(d.log))console.log("drive.log:",JSON.stringify(d.log));
if(d.sniff){console.log("--- sniff azioni __ajax ---"); d.sniff.forEach(s=>console.log(JSON.stringify(s).slice(0,500)));}
'
