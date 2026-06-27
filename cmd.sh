set -u
echo "=== stato scraper Italiana ==="
curl -s --max-time 20 "http://127.0.0.1:4300/status" || echo "(status non raggiungibile)"
echo
echo "=== MOTO DA23765 VOLTURA (con retry) ==="
for attempt in 1 2 3; do
  echo "-- tentativo $attempt --"
  curl -s --max-time 110 "http://127.0.0.1:4300/hubveicolo?targa=DA23765&situazione=Voltura%20al%20PRA&debug=1" -o /tmp/volt.json
  BYTES=$(wc -c </tmp/volt.json)
  echo "bytes: $BYTES"
  if grep -q "has been closed\|Target page" /tmp/volt.json 2>/dev/null; then echo "(browser chiuso, riprovo)"; sleep 8; continue; fi
  break
done
node -e '
let d; try{ d=require("/tmp/volt.json"); }catch(e){ console.log("PARSE ERR", e.message); process.exit(0);} 
console.log("ok:",d.ok,"| error:",d.error||"","| portalError:",d.portalError||"");
console.log("veicolo(norm):",JSON.stringify(d.veicolo));
console.log("raw_veicolo keys:",d.raw_veicolo?Object.keys(d.raw_veicolo):null);
console.log("raw_veicolo:",JSON.stringify(d.raw_veicolo||{}).slice(0,1200));
if(d.sniff){console.log("--- sniff azioni __ajax ---"); d.sniff.forEach(s=>console.log(JSON.stringify(s).slice(0,650)));}
'
