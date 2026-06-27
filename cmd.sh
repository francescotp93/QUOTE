set -u
echo "=== verifica estrazione marca/modello (Voltura DA23765) dopo deploy ==="
for attempt in 1 2 3 4 5; do
  ST=$(curl -s --max-time 15 "http://127.0.0.1:4300/status")
  echo "tentativo $attempt — status: $ST"
  curl -s --max-time 110 "http://127.0.0.1:4300/hubveicolo?targa=DA23765&situazione=Voltura%20al%20PRA" -o /tmp/v.json
  if grep -q "has been closed\|Target page\|502 Bad" /tmp/v.json 2>/dev/null; then echo "(scraper non pronto, riprovo)"; sleep 12; continue; fi
  MARCA=$(node -e 'try{console.log((require("/tmp/v.json").veicolo||{}).marca||"")}catch(e){console.log("")}')
  if [ -n "$MARCA" ]; then break; fi
  echo "(marca ancora vuota, riprovo)"; sleep 12
done
node -e '
let d; try{ d=require("/tmp/v.json"); }catch(e){ console.log("PARSE ERR"); process.exit(0);} 
const v=d.veicolo||{};
console.log("ok:",d.ok,"portalError:",d.portalError||"");
console.log("MARCA:",v.marca,"| MODELLO:",v.modello,"| ALLESTIMENTO:",v.allestimento);
console.log("alimentazione:",v.alimentazione,"| cilindrata:",v.cilindrata,"| immatric:",v.data_immatricolazione);
console.log("codice_marca:",v.codice_marca,"| codice_modello:",v.codice_modello,"| valore:",v.valore);
console.log("allestimenti:",JSON.stringify(v.allestimenti));
'
