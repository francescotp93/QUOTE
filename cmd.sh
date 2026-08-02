#!/usr/bin/env bash
# SOLA LETTURA. Quanti tentativi di accesso ai portali ci sono stati, e quando.
echo "### QUANTE VOLTE SONO RIPARTITI I SERVIZI OGGI ###"
for s in allianz-scraper italiana-scraper hdi-scraper; do
  n=$(journalctl -u "$s" --since today --no-pager 2>/dev/null | grep -c "Started .*scraper")
  printf '%-20s %s riavvii   (attivo da %s)\n' "$s" "$n" "$(systemctl show -p ActiveEnterTimestamp --value "$s" 2>/dev/null)"
done

echo; echo "### TENTATIVI DI ACCESSO VERI, PER ORA ###"
for s in allianz-scraper italiana-scraper hdi-scraper; do
  echo "--- $s ---"
  journalctl -u "$s" --since today --no-pager 2>/dev/null \
    | grep -E "autoLogin step1|autoLogin: il portale|codice monouso inserito" \
    | awk '{print substr($3,1,5)}' | cut -c1-2 | sort | uniq -c | awk '{print "   ore "$2": "$1" tentativi"}'
done

echo; echo "### QUANTE VOLTE IL FRENO HA FERMATO UN TENTATIVO ###"
for s in allianz-scraper italiana-scraper hdi-scraper; do
  printf '%-20s %s volte\n' "$s" "$(journalctl -u "$s" --since today --no-pager 2>/dev/null | grep -c 'freno.*saltato')"
done

echo; echo "### STATO DEL FRENO ADESSO ###"
for p in 4200:allianz 4300:italiana; do
  port=${p%%:*}; nome=${p##*:}
  printf '%-10s ' "$nome"
  curl -s -m 20 "http://127.0.0.1:$port/status" | node -e '
    let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{
      try{const j=JSON.parse(s);console.log("loggato:",j.loggato,"| freno:",JSON.stringify(j.freno||{}));}
      catch{console.log("(non risponde)");}});' 2>/dev/null || echo "(non risponde)"
done

echo; echo "### ULTIME RIGHE ALLIANZ ###"
journalctl -u allianz-scraper --since '-30 min' --no-pager 2>/dev/null | grep -E "autoLogin|freno" | tail -12
