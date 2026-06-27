set -u
echo "=== attendo deploy nuova estrazione ==="
for i in $(seq 1 15); do
  if grep -q "deepFindPremio" /opt/withus-backend/scraper/hdi/quote-service.mjs 2>/dev/null; then echo "deployato ($i)"; break; fi
  echo "  ...($i)"; sleep 12
done
sleep 8
echo "=== test HDI GY697XA + 10/09/1997 ==="
curl -s --max-time 210 "http://127.0.0.1:4400/premio?targa=GY697XA&nascita=10%2F09%2F1997" -o /tmp/h.json
echo "bytes: $(wc -c </tmp/h.json)"
node -e '
let d; try{ d=require("/tmp/h.json"); }catch(e){ console.log("PARSE ERR:",e.message); process.exit(0);} 
console.log("ok:",d.ok,"| PREMIO:",d.premio_annuale,"| num:",d.premio_annuale_num,"| src:",d.premio_src,"| key:",d.premio_key);
console.log("garanzie:",JSON.stringify(d.garanzie||[]).slice(0,500));
console.log("--- LOG ---"); (d.log||[]).forEach(l=>console.log("  ",l));
console.log("--- API che contengono premio ---");
(d.api||[]).filter(a=>a.k==="res"&&/premio/i.test(a.body||"")).forEach(a=>console.log("  ",a.url.replace("https://gwm.hdia.it/uefa/",""),"\n     ",String(a.body||"").slice(0,600)));
'
