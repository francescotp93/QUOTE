#!/usr/bin/env bash
# Cerca sezione collaboratori + attiva datatable estratti-conto (read-only)
set -u
S=http://127.0.0.1:4300
echo "=== sonde URL candidate 'collaboratori/struttura' ==="
for path in collaboratori produttori rete gestione-utenti utenti agenzia amministrazione struttura sub-agenti; do
  code=$(curl -s -o /tmp/c.json --max-time 60 -w '%{http_code}' "$S/explore?goto=%2F$path&sniff=1" 2>/dev/null)
  url=$(node -e 'try{console.log(JSON.parse(require("fs").readFileSync("/tmp/c.json","utf8")).url||"")}catch(e){}' 2>/dev/null)
  # se ci reindirizza alla home o al login, il path non esiste
  echo "  /$path -> ${url:-nessuna}"
done
echo
echo "=== estratti-conto: provo a cliccare la tabella per far partire il datatable ==="
curl -s --max-time 90 "$S/explore?goto=%2Festratti-conto&click=Cerca&sniff=1" > /tmp/ec.json 2>/dev/null
node -e 'try{const d=JSON.parse(require("fs").readFileSync("/tmp/ec.json","utf8"));(d.captured||[]).filter(c=>c.kind==="req").forEach(c=>console.log("  ",c.method,(c.url||"").slice(-40),"|",(c.body||"").slice(0,70)));if(!(d.captured||[]).length)console.log("  (nessuna chiamata)");}catch(e){console.log("ERR",e.message)}'
echo "FINE."
