set -u
echo "=== attendo deploy driveHDIQuote ==="
for i in $(seq 1 15); do
  if grep -q "driveHDIQuote" /opt/withus-backend/scraper/hdi/quote-service.mjs 2>/dev/null; then echo "deployato ($i)"; break; fi
  echo "  ...($i)"; sleep 12
done
sleep 8
echo "=== test HDI /premio targa FA20290 ==="
curl -s --max-time 200 "http://127.0.0.1:4400/premio?targa=FA20290&nascita=17%2F07%2F1993" -o /tmp/h.json
echo "bytes: $(wc -c </tmp/h.json)"
node -e '
let d; try{ d=require("/tmp/h.json"); }catch(e){ console.log("PARSE ERR:",e.message); process.exit(0);} 
console.log("ok:",d.ok,"| premio_annuale:",d.premio_annuale,"| num:",d.premio_annuale_num);
console.log("url:",d.url);
console.log("garanzie:",JSON.stringify(d.garanzie||[]).slice(0,500));
console.log("--- LOG drive ---"); (d.log||[]).forEach(l=>console.log("  ",l));
console.log("--- API gwm.hdia.it ("+((d.api||[]).length)+") ---");
(d.api||[]).forEach(a=>console.log("  ",a.m,"["+a.s+"]",a.url,"\n     body:",String(a.body||"").slice(0,300)));
'
