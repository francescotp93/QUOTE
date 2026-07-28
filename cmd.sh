#!/usr/bin/env bash
# CARRELLATA gestionale Plurima — naviga ogni sezione (sola lettura) e cattura azioni a=
set -u
S=http://127.0.0.1:4300
SEZIONI="polizze scadenze estratti-conto richieste il-tuo-portafoglio preventivazione"
for sec in $SEZIONI; do
  echo "══════════ /$sec ══════════"
  curl -s --max-time 90 "$S/explore?goto=%2F$sec&sniff=1" > /tmp/sec.json 2>/dev/null
  node -e '
  try{
    const d=JSON.parse(require("fs").readFileSync("/tmp/sec.json","utf8"));
    console.log("  URL:", d.url, "| TITLE:", (d.title||"").slice(0,50));
    const acts=new Set();
    (d.captured||[]).forEach(c=>{ if(c.kind==="req"){ const m=(c.body||"").match(/(?:^|&)a=([^&]+)/); if(m)acts.add(m[1]); }});
    console.log("  azioni a=:", [...acts].join(", ")||"(nessuna)");
    const btns=(d.fields||[]).filter(f=>f.tag==="select"||/button|submit/.test(f.type||"")).map(f=>f.id||f.name).filter(Boolean);
    if(btns.length) console.log("  campi/select:", btns.slice(0,10).join(", "));
    console.log("  n.chiamate catturate:", (d.captured||[]).length);
  }catch(e){ console.log("  ERR:", e.message); }
  '
done
echo "FINE."
