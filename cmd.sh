#!/usr/bin/env bash
# Sola lettura: il rilascio e' arrivato, e che cosa dice il login Allianz adesso.
cd /opt/withus-backend 2>/dev/null && echo "commit: $(git log -1 --format='%h %s')"
echo "via del codice monouso presente: $(grep -c 'inserisciCodiceMonouso' scraper/allianz/quote-service.mjs)"
echo
echo "### LOG ALLIANZ DOPO IL RIAVVIO ###"
journalctl -u allianz-scraper --since '-6 min' --no-pager 2>/dev/null | grep -E "autoLogin|freno|keep-alive|LOGGATO|loggato" | tail -20
echo
echo "### STATO ###"
curl -s -m 30 http://127.0.0.1:4200/status | node -e '
  let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{
    let j;try{j=JSON.parse(s);}catch{console.log("(non JSON)");return;}
    console.log("loggato:", j.loggato, "| url:", (j.url||"").slice(0,90));
    console.log("freno:", JSON.stringify(j.freno||{}));
  });'
