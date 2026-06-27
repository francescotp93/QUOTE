set -u
echo "=== 24H /quote per FA20290 (full response) ==="
curl -s --max-time 230 "http://127.0.0.1:4100/quote?targa=FA20290&nascita=17%2F07%2F1993&cf=DDOFNC93L17D423L&comune=Marsala" -o /tmp/q.json
echo "bytes: $(wc -c </tmp/q.json)"
node -e '
let d; try{ d=require("/tmp/q.json"); }catch(e){ console.log("PARSE ERR:", e.message); process.exit(0);} 
console.log("ok:",d.ok,"| premio_totale:",d.premio_totale,"| premio_rca:",d.premio_rca);
console.log("error:",d.error||d.msg||"");
console.log("veicolo:",JSON.stringify(d.veicolo||null));
console.log("step/stato:",d.step||d.stato||d.fase||"");
if(d.log) console.log("LOG:",JSON.stringify(d.log).slice(0,1500));
console.log("chiavi:",Object.keys(d));
'
