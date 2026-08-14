#!/usr/bin/env bash
# Fase 3 — terzo controllo: Allianz era gia' scollegato PRIMA del riavvio?
# Solo lettura. Nessuna credenziale viene stampata: della memoria fonti
# leggo esclusivamente i campi di stato, mai i segreti.
set -u
cd /opt/withus-backend || exit 1

echo "== Allianz: storia del collegamento negli ultimi 3 giorni =="
journalctl -u allianz-scraper --since '-3 days' --no-pager 2>/dev/null \
  | grep -iE 'loggato|login|2FA|Duo|ANIA|sessione' | tail -40

echo
echo "== stato delle fonti in memoria (solo campi di stato) =="
node -e '
const fs=require("fs");
for (const f of ["server/fonti.store.json","server/fontiWatchdog.store.json"]) {
  console.log("---- "+f+" ----");
  let j; try { j=JSON.parse(fs.readFileSync(f,"utf8")); } catch(e){ console.log("illeggibile: "+e.message); continue; }
  const sicuri=["salute","dettoSalute","conferme","ultimo","stato","quando","aggiornato","attiva","vigilanza","ok","errore","motivo"];
  const mostra=(k,v,ind)=>{
    if (v && typeof v==="object" && !Array.isArray(v)) {
      const dentro=Object.keys(v).filter(x=>sicuri.includes(x));
      console.log(ind+k+": {"+dentro.map(x=>x+"="+JSON.stringify(v[x])).join(", ")+"}");
      for (const [k2,v2] of Object.entries(v)) if (v2 && typeof v2==="object" && !Array.isArray(v2)) mostra(k2,v2,ind+"  ");
    } else if (sicuri.includes(k)) console.log(ind+k+" = "+JSON.stringify(v));
  };
  for (const [k,v] of Object.entries(j)) mostra(k,v,"");
}
' 2>&1 | head -60

echo
echo "== quando ha riavviato ciascuna fonte =="
for s in /etc/systemd/system/*scraper*.service; do
  n=$(basename "$s")
  printf '%-28s %s\n' "$n" "$(systemctl show "$n" -p ActiveEnterTimestamp --value)"
done
